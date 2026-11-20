import "server-only";
import { z } from "zod";
import { normalizeUrl, runStructured, type RunUsage } from "@/lib/ai/claude";
import { getCredential } from "@/lib/credentials";
import { businessDiscovery } from "@/lib/integrations/meta";
import { adminClient, logActivity } from "@/lib/supabase/admin";
import { addUsage, finishRun, startRun, ZERO_USAGE } from "@/lib/jobs/runs";
import { INDUSTRIES } from "@/lib/db/types";
import { WEBCRAFT_PROFILE } from "./profile";

const Candidate = z.object({
  username: z.string().regex(/^[A-Za-z0-9._]{1,30}$/),
  display_name: z.string().nullable(),
  country_code: z.string().length(2).nullable(),
  industry: z.enum(INDUSTRIES).nullable(),
  category: z.enum(["potential_client", "collaborator", "community", "media", "peer"]),
  reason: z.string().max(300),
  suggested_engagement: z.string().max(300).describe("A genuine, specific way for a human to engage (comment idea, collab pitch). Never automated."),
  evidence_url: z.string().url(),
});

const Research = z.object({
  accounts: z.array(Candidate).max(25),
  recommendations: z.array(z.object({
    type: z.enum(["collaboration", "conversation", "posting_improvement", "content_topic", "growth_strategy"]),
    title: z.string().max(120),
    detail: z.string().max(600),
  })).max(10),
});

const SYSTEM = `You are the Instagram Growth Strategist for ${WEBCRAFT_PROFILE.name}, ${WEBCRAFT_PROFILE.description}
Find Caribbean business Instagram accounts worth engaging with GENUINELY and recommend audience-development strategies.

Rules:
- Only list accounts you found evidence for in this session (evidence_url must be a page you retrieved).
- Recommendations are for a human to act on manually: thoughtful comments, collaborations, Lives, local events, content topics, posting improvements.
- Never recommend mass-follow/unfollow, automated likes or comments, engagement pods, bought followers, unsolicited bulk DMs or any automation that violates Instagram's terms.`;

/**
 * Research accounts, then verify each through Meta's official Business Discovery API when connected.
 * Unverifiable accounts are kept only if their evidence URL was actually retrieved by web search.
 */
export async function researchAudience(orgId: string, opts: { focus?: string; trigger?: string } = {}) {
  const db = adminClient();
  const run = await startRun(orgId, "growth_strategist", { focus: opts.focus }, opts.trigger);
  if (!run) return { skipped: "agent disabled" };
  let usage: RunUsage = ZERO_USAGE;
  try {
    const [{ data: metrics }, { data: existing }] = await Promise.all([
      db.from("social_metrics").select("metric, value, period_start, scope").eq("organization_id", orgId).order("period_start", { ascending: false }).limit(200),
      db.from("instagram_prospects").select("username").eq("organization_id", orgId),
    ]);
    const r = await runStructured({
      system: SYSTEM,
      prompt: `Focus: ${opts.focus ?? "Trinidad & Tobago first, then wider Caribbean; small and mid-size businesses in construction, retail, hospitality, real estate, fitness, professional services; plus local business communities and media."}
Our recent Instagram metrics (may be empty): ${JSON.stringify(metrics ?? []).slice(0, 6000)}
Skip already-listed accounts: ${(existing ?? []).map((e) => e.username).join(", ") || "(none)"}`,
      schema: Research,
      resultDescription: "Submit accounts and recommendations.",
      model: run.model,
      maxTokens: 10000,
      webSearch: { maxUses: 15 },
    });
    usage = addUsage(usage, r.usage);

    const cred = await getCredential(orgId, "meta_instagram");
    const { data: acct } = await db.from("instagram_accounts").select("ig_user_id").eq("organization_id", orgId).limit(1).maybeSingle();
    const token = cred ? (JSON.parse(cred.secret) as { page_token: string }).page_token : null;

    let saved = 0;
    const dropped: string[] = [];
    for (const c of r.data.accounts) {
      let followers: number | null = null;
      let media: number | null = null;
      let source = "web_research";
      if (token && acct) {
        try {
          const bd = await businessDiscovery(acct.ig_user_id, token, c.username);
          followers = bd.followers_count ?? null;
          media = bd.media_count ?? null;
          source = "business_discovery";
        } catch {
          // Personal/private accounts aren't discoverable; fall back to web evidence.
        }
      }
      if (source === "web_research" && !r.retrievedUrls.has(normalizeUrl(c.evidence_url))) {
        dropped.push(c.username);
        continue;
      }
      const { error } = await db.from("instagram_prospects").upsert({
        organization_id: orgId, username: c.username.toLowerCase(), display_name: c.display_name, country_code: c.country_code,
        industry: c.industry, followers_count: followers, media_count: media, category: c.category, reason: c.reason,
        suggested_engagement: c.suggested_engagement, data_source: source, researched_at: new Date().toISOString(),
      }, { onConflict: "organization_id,username" });
      if (!error) saved++;
    }

    const output = { saved, dropped, recommendations: r.data.recommendations };
    await finishRun(run.runId, { output, usage });
    await db.from("notifications").insert({ organization_id: orgId, kind: "growth", title: `Growth research: ${saved} accounts, ${r.data.recommendations.length} recommendations`, link: "/audience" });
    await logActivity(orgId, { type: "agent", id: "growth_strategist" }, "growth.researched", { type: "agent_runs", id: run.runId }, { saved });
    return output;
  } catch (err) {
    await finishRun(run.runId, { error: (err as Error).message, usage });
    throw err;
  }
}
