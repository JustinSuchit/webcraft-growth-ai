import "server-only";
import { z } from "zod";
import { normalizeUrl, runStructured } from "@/lib/ai/claude";
import { auditHomepage } from "@/lib/compliance/site-audit";
import { computeLeadScore } from "@/lib/scoring";
import { adminClient, logActivity } from "@/lib/supabase/admin";
import { finishRun, startRun } from "@/lib/jobs/runs";
import { INDUSTRIES, SERVICES, type OrgSettings } from "@/lib/db/types";
import { WEBCRAFT_PROFILE } from "./profile";

const Component = z.number().int().min(0).max(100);

export const DiscoveredProspect = z.object({
  business_name: z.string().min(2),
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2, e.g. TT, BB, JM, GY"),
  city: z.string().nullable(),
  industry: z.enum(INDUSTRIES),
  website_url: z.string().url().nullable(),
  instagram_url: z.string().url().nullable(),
  public_email: z.string().email().nullable().describe("Only a business email published by the business itself"),
  phone: z.string().nullable(),
  contact_source_url: z.string().url().nullable().describe("Page where the email/phone was published"),
  evidence_urls: z.array(z.string().url()).min(1).describe("URLs you actually retrieved that support the facts above"),
  summary: z.string().max(800),
  opportunities: z.array(z.object({ service: z.enum(SERVICES), rationale: z.string().max(400), evidence_url: z.string().url() })).min(1),
  confidence: z.number().min(0).max(1),
  score_components: z.object({ service_fit: Component, verified_need: Component, contact_quality: Component, buying_intent: Component }),
});
export type DiscoveredProspect = z.infer<typeof DiscoveredProspect>;

const Result = z.object({ prospects: z.array(DiscoveredProspect), search_notes: z.string().max(1000) });

const SYSTEM = `You are the Lead Discovery agent for ${WEBCRAFT_PROFILE.name}, ${WEBCRAFT_PROFILE.description}

Your job: find real Caribbean businesses that could genuinely benefit from WebCraft TT's services, using web search.

Hard rules:
- Never invent or guess any fact. Every business, website, email, phone and observation must come from a page you retrieved in this session, and that page must be listed in evidence_urls (or contact_source_url / opportunity evidence_url).
- If you cannot find a published business email, set public_email to null. Do not construct addresses like info@domain.
- Only include contact details the business published itself for business enquiries. No personal social profiles, no data from leaked or people-search sites.
- Do not use or cite content from sites that prohibit automated access, and do not attempt to bypass logins or paywalls.
- Opportunities must be specific and evidenced (e.g. "no website found; Facebook page is the only presence", "site is not mobile friendly", "copyright 2016, no online ordering"). No generic flattery.
- Be honest about confidence: 0.9+ only when name, location and contact are all confirmed on the business's own site or an official registry.
- Score components are 0–100: service_fit (match to our services), verified_need (strength of evidence), contact_quality (named decision-maker email > generic inbox > phone only), buying_intent (explicit signals like expansion, hiring, new location, launching products).`;

/**
 * Discover and research prospects. Post-validates every evidence URL against what web_search
 * actually returned; prospects with no verifiable evidence are discarded, never stored.
 */
export async function runLeadDiscovery(orgId: string, opts: { target?: number; countries?: string[]; industries?: string[]; trigger?: string } = {}) {
  const db = adminClient();
  const { data: org } = await db.from("organizations").select("settings").eq("id", orgId).single();
  const settings = (org?.settings ?? {}) as OrgSettings;
  const target = Math.min(25, opts.target ?? settings.daily_prospect_target ?? 10);
  const countries = opts.countries ?? ["TT", ...(settings.expansion_countries ?? ["BB", "JM", "GY", "LC", "GD"])];
  const industries = opts.industries ?? INDUSTRIES.filter((i) => i !== "other");

  const run = await startRun(orgId, "lead_discovery", { target, countries, industries }, opts.trigger);
  if (!run) return { skipped: "agent disabled" };

  try {
    const { data: existing } = await db.from("prospects").select("business_name, website_domain").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(300);
    const known = (existing ?? []).map((p) => p.website_domain || p.business_name).join(", ");

    const prompt = `Find up to ${target} new prospects.
Countries, in priority order (start with the first; only move on when it is exhausted): ${countries.join(", ")}.
Industries: ${industries.join(", ")}.
Prefer businesses with clear signals of need: no website, outdated or non-mobile site, no online ordering/booking where it would obviously help, or recent growth (new branch, expansion, hiring).
Already in our CRM — skip these: ${known || "(none)"}.
Return fewer results rather than weak or unverified ones.`;

    const { data, usage, retrievedUrls } = await runStructured({
      system: SYSTEM,
      prompt,
      schema: Result,
      resultDescription: "Submit the verified prospects you found.",
      model: run.model,
      maxTokens: 16000,
      webSearch: { maxUses: Math.min(40, target * 4) },
    });

    const saved: string[] = [];
    const discarded: { name: string; reason: string }[] = [];

    for (const p of data.prospects) {
      const verify = (u: string | null) => (u ? retrievedUrls.has(normalizeUrl(u)) : false);
      const verifiedEvidence = p.evidence_urls.filter(verify);
      if (verifiedEvidence.length === 0) {
        discarded.push({ name: p.business_name, reason: "no evidence URL matched retrieved sources" });
        continue;
      }
      const unverified = [
        ...p.evidence_urls.filter((u) => !verify(u)).map((u) => ({ claim: "evidence", url: u })),
        ...p.opportunities.filter((o) => !verify(o.evidence_url)).map((o) => ({ claim: o.rationale, url: o.evidence_url })),
      ];
      // A contact we cannot trace to a retrieved page is dropped rather than stored.
      const emailVerified = Boolean(p.public_email && p.contact_source_url && verify(p.contact_source_url));
      const confidence = Math.max(0, Math.min(1, p.confidence - unverified.length * 0.1));

      const observations = p.website_url ? await auditHomepage(p.website_url) : { fetched: false, skippedReason: "no_website", checkedAt: new Date().toISOString() };
      const domain = p.website_url ? new URL(p.website_url).hostname.replace(/^www\./, "").toLowerCase() : null;

      const { data: inserted, error } = await db
        .from("prospects")
        .insert({
          organization_id: orgId,
          business_name: p.business_name,
          country_code: p.country_code.toUpperCase(),
          city: p.city,
          industry: p.industry,
          website_url: p.website_url,
          website_domain: domain,
          instagram_url: p.instagram_url,
          phone: p.phone,
          public_email: emailVerified ? p.public_email : null,
          status: "researched",
          confidence,
          source: "agent",
          discovered_by_run_id: run.runId,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        discarded.push({ name: p.business_name, reason: error?.code === "23505" ? "duplicate" : (error?.message ?? "insert failed") });
        continue;
      }

      if (emailVerified) {
        await db.from("contacts").insert({
          organization_id: orgId, prospect_id: inserted.id, email: p.public_email, phone: p.phone,
          source_url: p.contact_source_url, is_primary: true, verified_at: new Date().toISOString(),
        });
      }
      await db.from("prospect_research").insert({
        organization_id: orgId,
        prospect_id: inserted.id,
        agent_run_id: run.runId,
        summary: p.summary,
        website_observations: observations,
        opportunities: p.opportunities,
        evidence_urls: verifiedEvidence,
        unverified_claims: unverified,
        confidence,
      });

      const scored = computeLeadScore({
        serviceFit: p.score_components.service_fit,
        verifiedNeed: p.score_components.verified_need,
        contactQuality: emailVerified ? p.score_components.contact_quality : Math.min(p.score_components.contact_quality, p.phone ? 20 : 5),
        engagement: 0,
        buyingIntent: p.score_components.buying_intent,
        evidenceCount: verifiedEvidence.length,
        hasDeliverableContact: emailVerified,
        suppressed: false,
      });
      await db.from("lead_scores").insert({
        organization_id: orgId, prospect_id: inserted.id, score: scored.score,
        service_fit: scored.components.serviceFit, verified_need: scored.components.verifiedNeed,
        contact_quality: scored.components.contactQuality, engagement: 0, buying_intent: scored.components.buyingIntent,
        rationale: scored.notes.join(" ") || null,
      });
      await db.from("prospects").update({ current_score: scored.score, status: scored.score >= 50 ? "qualified" : "researched" }).eq("id", inserted.id);
      saved.push(inserted.id);
    }

    const output = { saved: saved.length, discarded, notes: data.search_notes, searches: usage.webSearches };
    await finishRun(run.runId, { output, usage });
    await logActivity(orgId, { type: "agent", id: "lead_discovery" }, "lead_discovery.completed", { type: "agent_runs", id: run.runId }, output);
    return output;
  } catch (err) {
    await finishRun(run.runId, { error: (err as Error).message });
    throw err;
  }
}
