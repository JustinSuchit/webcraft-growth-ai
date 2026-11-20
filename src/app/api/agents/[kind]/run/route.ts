import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { enqueue, type JobType } from "@/lib/jobs/queue";
import { runWorker } from "@/lib/jobs/worker";

export const maxDuration = 60;

const JOBS: Record<string, JobType> = {
  lead_discovery: "lead_discovery.run",
  content_creator: "content.plan_week",
  growth_strategist: "growth.research",
  crm_manager: "crm.daily_summary",
};

/** Manual trigger: enqueue (idempotent per minute) and start draining the queue in the background. */
export const POST = route(async (_req: NextRequest, { params }: { params: Promise<{ kind: string }> }) => {
  rejectInDemo();
  const { kind } = await params;
  const job = JOBS[kind];
  if (!job) return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  const { orgId, user } = await requireMembership("member");
  await enqueue(orgId, job, { trigger: "manual", by: user.id }, `${job}:manual:${Math.floor(Date.now() / 60_000)}`, new Date(), 2);
  after(() => runWorker(`manual-${kind}`, 55_000).catch(() => undefined));
  return NextResponse.json({ ok: true, queued: job });
});
