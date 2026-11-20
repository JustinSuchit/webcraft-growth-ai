import "server-only";
import { complete } from "@/lib/ai/claude";
import { computeLeadScore } from "@/lib/scoring";
import { adminClient, logActivity } from "@/lib/supabase/admin";
import { finishRun, startRun } from "@/lib/jobs/runs";

const ENGAGEMENT: Record<string, { engagement: number; intent: number }> = {
  meeting_request: { engagement: 90, intent: 90 },
  quote_request: { engagement: 85, intent: 95 },
  interested: { engagement: 75, intent: 70 },
  question: { engagement: 60, intent: 45 },
  not_interested: { engagement: 20, intent: 0 },
  out_of_office: { engagement: 10, intent: 0 },
};

/** Re-score a prospect after a reply. Deterministic: keeps prior evidence-based components, raises engagement/intent. */
export async function rescoreFromEngagement(orgId: string, prospectId: string, classification: string) {
  const db = adminClient();
  const { data: last } = await db.from("lead_scores").select("*").eq("prospect_id", prospectId).order("scored_at", { ascending: false }).limit(1).maybeSingle();
  const { count: evidence } = await db.from("prospect_research").select("id", { count: "exact", head: true }).eq("prospect_id", prospectId);
  const bump = ENGAGEMENT[classification] ?? { engagement: 30, intent: 10 };
  const s = computeLeadScore({
    serviceFit: last?.service_fit ?? 50,
    verifiedNeed: last?.verified_need ?? 30,
    contactQuality: Math.max(last?.contact_quality ?? 40, 70), // they replied → the contact works
    engagement: Math.max(last?.engagement ?? 0, bump.engagement),
    buyingIntent: classification === "not_interested" ? 0 : Math.max(last?.buying_intent ?? 0, bump.intent),
    evidenceCount: evidence ?? 0,
    hasDeliverableContact: true,
    suppressed: false,
  });
  await db.from("lead_scores").insert({
    organization_id: orgId, prospect_id: prospectId, score: s.score,
    service_fit: s.components.serviceFit, verified_need: s.components.verifiedNeed, contact_quality: s.components.contactQuality,
    engagement: s.components.engagement, buying_intent: s.components.buyingIntent, rationale: `Reply classified: ${classification}`,
  });
  await db.from("prospects").update({ current_score: s.score }).eq("id", prospectId);
  return s.score;
}

/** Daily digest: top prospects, due follow-ups, replies needing attention, pipeline value. */
export async function dailySummary(orgId: string) {
  const db = adminClient();
  const run = await startRun(orgId, "crm_manager", { kind: "daily_summary" });
  if (!run) return { skipped: "agent disabled" };
  try {
    const endOfDay = new Date(); endOfDay.setUTCHours(23, 59, 59, 999);
    const [hot, due, attention, pipeline, pending] = await Promise.all([
      db.from("prospects").select("business_name, country_code, industry, current_score, status").eq("organization_id", orgId)
        .not("status", "in", "(won,lost,do_not_contact)").order("current_score", { ascending: false, nullsFirst: false }).limit(8),
      db.from("follow_up_tasks").select("title, due_at, kind").eq("organization_id", orgId).is("completed_at", null).lte("due_at", endOfDay.toISOString()).order("due_at").limit(15),
      db.from("email_threads").select("subject, last_classification").eq("organization_id", orgId).eq("needs_attention", true).limit(10),
      db.from("opportunities").select("stage, value_ttd").eq("organization_id", orgId).not("stage", "in", "(won,lost)"),
      db.from("approval_requests").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "pending"),
    ]);
    const pipelineValue = (pipeline.data ?? []).reduce((s, o) => s + Number(o.value_ttd ?? 0), 0);
    const facts = {
      top_prospects: hot.data, due_today: due.data, needs_attention: attention.data,
      open_pipeline_ttd: pipelineValue, pending_approvals: pending.count ?? 0,
    };
    let summary = `Pending approvals: ${facts.pending_approvals}. Follow-ups due: ${due.data?.length ?? 0}. Replies needing attention: ${attention.data?.length ?? 0}.`;
    let usage;
    try {
      const r = await complete(
        "You are the CRM Manager agent. Write a concise morning brief (max 150 words, plain text, short bullets) using ONLY the JSON facts given. Do not invent anything. Lead with what needs action today.",
        JSON.stringify(facts),
      );
      summary = r.text;
      usage = r.usage;
    } catch {
      // No Claude available: deterministic summary above still goes out.
    }
    await db.from("notifications").insert({ organization_id: orgId, kind: "daily_summary", title: "Daily sales brief", body: summary, link: "/" });
    await finishRun(run.runId, { output: { summary, facts }, usage });
    await logActivity(orgId, { type: "agent", id: "crm_manager" }, "crm.daily_summary", { type: "agent_runs", id: run.runId });
    return { summary };
  } catch (err) {
    await finishRun(run.runId, { error: (err as Error).message });
    throw err;
  }
}
