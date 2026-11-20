import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export type JobType =
  | "lead_discovery.run"
  | "crm.daily_summary"
  | "outreach.draft"
  | "outreach.send"
  | "outreach.sync_replies"
  | "content.plan_week"
  | "social.publish"
  | "social.sync_metrics"
  | "growth.research";

/**
 * Enqueue idempotently: the (org, idempotency_key) unique constraint means the same logical job
 * (e.g. "lead_discovery:2026-11-20") is only ever created once, even if cron fires twice.
 */
export async function enqueue(orgId: string, type: JobType, payload: Record<string, unknown>, idempotencyKey: string, runAt = new Date(), maxAttempts = 5) {
  const { error } = await adminClient()
    .from("scheduled_jobs")
    .upsert(
      { organization_id: orgId, job_type: type, payload, idempotency_key: idempotencyKey, run_at: runAt.toISOString(), max_attempts: maxAttempts },
      { onConflict: "organization_id,idempotency_key", ignoreDuplicates: true },
    );
  if (error) throw new Error(`enqueue failed: ${error.message}`);
}
