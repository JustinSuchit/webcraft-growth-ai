import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { IntegrationError } from "@/lib/integrations/errors";
import { ApprovalError } from "@/lib/approvals";
import { backoffSeconds, Reschedule } from "./backoff";
import { handlers } from "./handlers";

interface ClaimedJob { id: string; organization_id: string; job_type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }

/**
 * Drain due jobs until the time budget is spent. Safe to run concurrently: claim_jobs() uses
 * FOR UPDATE SKIP LOCKED, and crashed workers' locks expire after 15 minutes.
 */
export async function runWorker(workerId: string, budgetMs = 50_000) {
  const db = adminClient();
  const deadline = Date.now() + budgetMs;
  const summary = { succeeded: 0, failed: 0, rescheduled: 0, dead: 0 };

  while (Date.now() < deadline - 5_000) {
    const { data: jobs, error } = await db.rpc("claim_jobs", { p_worker: workerId, p_limit: 3 });
    if (error) throw new Error(`claim_jobs: ${error.message}`);
    if (!jobs?.length) break;

    await Promise.all(
      (jobs as ClaimedJob[]).map(async (job) => {
        const handler = handlers[job.job_type as keyof typeof handlers];
        try {
          if (!handler) throw new IntegrationError("worker", `no handler for ${job.job_type}`, true);
          const result = await handler(job.organization_id, job.payload);
          await db.from("scheduled_jobs").update({ status: "succeeded", result: result ?? null, locked_at: null, last_error: null }).eq("id", job.id);
          summary.succeeded++;
        } catch (err) {
          if (err instanceof Reschedule) {
            // Not a failure: give the attempt back.
            await db.from("scheduled_jobs").update({
              status: "pending", locked_at: null, attempts: job.attempts - 1,
              run_at: new Date(Date.now() + err.seconds * 1000).toISOString(),
            }).eq("id", job.id);
            summary.rescheduled++;
            return;
          }
          const permanent = err instanceof ApprovalError || (err instanceof IntegrationError && err.permanent);
          const message = (err as Error).message?.slice(0, 2000) ?? String(err);
          if (permanent || job.attempts >= job.max_attempts) {
            await db.from("scheduled_jobs").update({ status: "dead", last_error: message, locked_at: null }).eq("id", job.id);
            await db.from("notifications").insert({
              organization_id: job.organization_id, kind: "job_failed",
              title: `Background job failed: ${job.job_type}`, body: message, link: "/agents",
            });
            summary.dead++;
          } else {
            const wait = err instanceof IntegrationError && err.retryAfterSec ? err.retryAfterSec : backoffSeconds(job.attempts);
            await db.from("scheduled_jobs").update({
              status: "pending", last_error: message, locked_at: null,
              run_at: new Date(Date.now() + wait * 1000).toISOString(),
            }).eq("id", job.id);
            summary.failed++;
          }
          console.error(JSON.stringify({ level: "error", job: job.job_type, id: job.id, attempt: job.attempts, permanent, message }));
        }
      }),
    );
  }
  return summary;
}
