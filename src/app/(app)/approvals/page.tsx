import { CheckSquare, Lock } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { ApprovalActions } from "@/components/app/approval-actions";
import { ctx, loadApprovals } from "@/lib/data";
import { label, relTime, ttDate } from "@/lib/utils";

export const metadata = { title: "Approval Queue" };

const KIND_HELP: Record<string, string> = {
  email_message: "Approves this exact email to this recipient. Editing it afterwards voids the approval.",
  email_campaign: "Approves first-touch emails only to the listed recipients, within the daily and total caps, until expiry. Follow-up replies still need individual approval.",
  social_post: "Approves this exact post. Editing the caption or images voids the approval.",
  publishing_schedule: "Approves the listed posts, unchanged, up to the weekly cap until expiry.",
};

export default async function ApprovalsPage() {
  const c = await ctx();
  const approvals = await loadApprovals(c);
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending").slice(0, 20);
  const canDecide = c.role === "owner" || c.role === "admin";

  return (
    <>
      <PageHeader title="Approval Queue" description="Agents draft; you decide. Approvals are enforced in the database — agents cannot approve, widen or reuse them." />
      {!canDecide ? <p className="mb-4 flex items-center gap-2 text-xs text-muted"><Lock className="h-3.5 w-3.5" /> Only owners and admins can approve.</p> : null}
      <div className="space-y-4">
        {pending.length ? pending.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="sun">{label(a.kind)}</Badge>
                  <span className="text-xs text-muted">requested by {a.requested_by.replace("agent:", "").replace("_", " ")} · {relTime(a.created_at)} · expires {ttDate(a.expires_at, { month: "short", day: "numeric" })}</span>
                </div>
                <p className="mt-2 font-medium">{a.title}</p>
                {a.summary ? <p className="text-sm text-muted">{a.summary}</p> : null}
                {a.body ? <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-2/50 p-4 font-sans text-sm leading-relaxed">{a.body}</pre> : null}
                <p className="mt-3 text-[11px] text-muted">{KIND_HELP[a.kind]}</p>
              </div>
              <ApprovalActions id={a.id} updatedAt={"updated_at" in a ? String(a.updated_at) : a.created_at} demo={c.demo} disabled={!canDecide} />
            </div>
          </Card>
        )) : <Card><EmptyState icon={<CheckSquare className="h-5 w-5" />} title="Nothing waiting" body="New drafts and posts from the agents appear here for review." /></Card>}
      </div>
      {decided.length ? (
        <>
          <h2 className="mb-3 mt-10 text-sm font-semibold">Recently decided</h2>
          <Card>
            <ul className="divide-y divide-border text-sm">
              {decided.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <StatusBadge status={a.status} />
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  <span className="tabular text-xs text-muted">{a.used_count}/{a.max_uses} used</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}
