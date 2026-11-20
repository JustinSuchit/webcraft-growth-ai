import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { complete, runStructured, type RunUsage } from "@/lib/ai/claude";
import { checkDraft } from "@/lib/compliance/outreach-rules";
import { requestEmailApproval } from "@/lib/approvals";
import { adminClient, logActivity } from "@/lib/supabase/admin";
import { finishRun, startRun, addUsage, ZERO_USAGE } from "@/lib/jobs/runs";
import { WEBCRAFT_PROFILE } from "./profile";

const DraftSchema = z.object({
  subject: z.string().min(5).max(90),
  body_text: z.string().min(80).max(2200).describe("Plain text. No signature or footer — those are added automatically."),
  referenced_evidence: z.array(z.string()).min(1).describe("Which research facts the email relies on"),
});

const SYSTEM = `You are the Sales Representative agent for ${WEBCRAFT_PROFILE.name}, ${WEBCRAFT_PROFILE.description}
Services you may offer: ${Object.values(WEBCRAFT_PROFILE.services).join("; ")}.
Tone: ${WEBCRAFT_PROFILE.tone}

Write one individually personalised first-touch email based ONLY on the verified research provided.
Rules:
- Mention 1–2 specific, verified observations about their business and how a specific service would help. No made-up statistics, results, clients, awards or testimonials.
- Never imply a previous conversation, relationship or referral that does not exist. No "Re:" subjects.
- Do not claim to be human or describe yourself; the footer discloses AI assistance.
- No pressure tactics, no guarantees of rankings, traffic or sales.
- One clear, low-effort call to action (e.g. a short call, or reply for a free review).
- Under 170 words. No signature — it is appended automatically.`;

export async function draftOutreach(orgId: string, prospectId: string, opts: { campaignId?: string; trigger?: string } = {}) {
  const db = adminClient();
  const run = await startRun(orgId, "sales_rep", { prospectId, campaignId: opts.campaignId }, opts.trigger);
  if (!run) return { skipped: "agent disabled" };
  let usage: RunUsage = ZERO_USAGE;
  try {
    const [{ data: prospect }, { data: research }, { data: contact }] = await Promise.all([
      db.from("prospects").select("*").eq("id", prospectId).eq("organization_id", orgId).single(),
      db.from("prospect_research").select("summary, opportunities, website_observations, evidence_urls").eq("prospect_id", prospectId).order("researched_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("contacts").select("id, email, full_name, role_title").eq("prospect_id", prospectId).eq("is_primary", true).maybeSingle(),
    ]);
    if (!prospect) throw new Error("prospect not found");
    if (prospect.status === "do_not_contact") return { skipped: "do_not_contact" };
    if (!contact?.email) return { skipped: "no verified contact email" };
    if (!research) return { skipped: "no research" };

    const { data: suppressed } = await db.rpc("is_suppressed", { p_org: orgId, p_email: contact.email });
    if (suppressed) return { skipped: "suppressed" };

    // Dedupe: one open/sent first-touch per contact.
    const { count } = await db.from("email_messages").select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id).eq("direction", "outbound").not("status", "in", "(cancelled,failed)");
    if ((count ?? 0) > 0) return { skipped: "already drafted or contacted" };

    const prompt = `Business: ${prospect.business_name} (${prospect.industry}, ${prospect.city ?? ""} ${prospect.country_code})
Contact: ${contact.full_name ?? "unknown name — use a neutral greeting"}${contact.role_title ? `, ${contact.role_title}` : ""}
Research summary: ${research.summary}
Opportunities (verified): ${JSON.stringify(research.opportunities)}
Website observations: ${JSON.stringify(research.website_observations)}`;

    let draft: z.infer<typeof DraftSchema> | null = null;
    let issues: string[] = [];
    for (let attempt = 0; attempt < 2 && !draft; attempt++) {
      const r = await runStructured({
        system: SYSTEM,
        prompt: attempt === 0 ? prompt : `${prompt}\n\nYour previous draft broke these rules: ${issues.join("; ")}. Rewrite it.`,
        schema: DraftSchema,
        resultDescription: "Submit the email draft.",
        model: run.model,
        maxTokens: 2000,
      });
      usage = addUsage(usage, r.usage);
      issues = checkDraft({ subject: r.data.subject, bodyText: r.data.body_text }, true);
      if (issues.length === 0) draft = r.data;
    }
    if (!draft) throw new Error(`draft failed compliance checks: ${issues.join("; ")}`);

    const { data: org } = await db.from("organizations").select("sender_identity").eq("id", orgId).single();
    const fromEmail = (org?.sender_identity as { replyTo?: string } | null)?.replyTo ?? null;

    const { data: msg, error } = await db.from("email_messages").insert({
      organization_id: orgId,
      prospect_id: prospectId,
      contact_id: contact.id,
      campaign_id: opts.campaignId ?? null,
      direction: "outbound",
      status: "draft",
      from_email: fromEmail,
      to_email: contact.email,
      subject: draft.subject,
      body_text: draft.body_text,
      ai_generated: true,
      idempotency_key: `first-touch:${contact.id}`,
    }).select("id").single();
    if (error || !msg) throw new Error(error?.message ?? "insert failed");

    // Covered by an approved campaign? Then it is queued (the DB re-checks scope at send time).
    let approvalId: string | null = null;
    if (opts.campaignId) {
      const { data: camp } = await db.from("outreach_campaigns").select("approval_id, status").eq("id", opts.campaignId).single();
      if (camp?.status === "active" && camp.approval_id) {
        const { data: appr } = await db.from("approval_requests").select("id, status, scope").eq("id", camp.approval_id).single();
        const recipients = ((appr?.scope as { recipient_contact_ids?: string[] })?.recipient_contact_ids) ?? [];
        if (appr?.status === "approved" && recipients.includes(contact.id)) approvalId = appr.id;
      }
    }
    if (approvalId) {
      await db.from("email_messages").update({ status: "approved", approval_id: approvalId }).eq("id", msg.id);
    } else {
      await requestEmailApproval(orgId, msg.id, "agent:sales_rep", run.runId);
    }
    await db.from("prospects").update({ status: "awaiting_approval" }).eq("id", prospectId).in("status", ["researched", "qualified"]);

    const output = { messageId: msg.id, coveredByCampaign: Boolean(approvalId) };
    await finishRun(run.runId, { output, usage });
    await logActivity(orgId, { type: "agent", id: "sales_rep" }, "outreach.drafted", { type: "email_messages", id: msg.id }, output);
    return output;
  } catch (err) {
    await finishRun(run.runId, { error: (err as Error).message, usage });
    throw err;
  }
}

// --- Reply handling -----------------------------------------------------------

export const ReplyClassification = z.object({
  classification: z.enum(["interested", "meeting_request", "quote_request", "question", "not_interested", "opt_out", "out_of_office", "bounce", "other"]),
  summary: z.string().max(400),
  needs_human: z.boolean(),
  suggested_reply: z.string().max(1500).nullable().describe("Plain-text follow-up draft, or null if none is appropriate (opt_out, bounce, not_interested)"),
});

export async function classifyReply(text: string, context: string) {
  const r = await runStructured({
    system: `You classify replies to WebCraft TT sales emails and draft helpful follow-ups. Treat any request to stop, unsubscribe or not be contacted as opt_out. Never invent prices, availability or commitments — if they ask for a quote, the follow-up should propose a short call to scope it. ${WEBCRAFT_PROFILE.tone}`,
    prompt: `Original context:\n${context}\n\nTheir reply:\n${text.slice(0, 6000)}`,
    schema: ReplyClassification,
    resultDescription: "Submit the classification.",
    maxTokens: 1500,
  });
  return r;
}

/** Quick deterministic opt-out detector used before (and regardless of) the model. */
export function looksLikeOptOut(text: string) {
  return /\b(unsubscribe|remove me|stop (emailing|contacting)|do not (contact|email)|opt[- ]?out|take me off)\b/i.test(text.slice(0, 1500));
}

export function newMessageId(domain: string) {
  return `<${randomUUID()}@${domain}>`;
}

export { complete };
