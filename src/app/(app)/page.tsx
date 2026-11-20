import Link from "next/link";
import { ArrowUpRight, CalendarCheck, CheckSquare, Flame } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, ScoreBar, Stat } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { LineChart } from "@/components/app/charts";
import { ctx, loadApprovals, loadMetrics, loadOpportunities, loadProspects, loadTasks, loadThreads } from "@/lib/data";
import { flag, fmtTTD, relTime } from "@/lib/utils";

export default async function Overview() {
  const c = await ctx();
  const [prospects, approvals, opps, metrics, tasks, threads] = await Promise.all([
    loadProspects(c), loadApprovals(c), loadOpportunities(c), loadMetrics(c), loadTasks(c), loadThreads(c),
  ]);
  const pending = approvals.filter((a) => a.status === "pending");
  const open = opps.filter((o) => !["won", "lost"].includes(o.stage));
  const weighted = open.reduce((s, o) => s + (o.value_ttd ?? 0) * ((o.probability ?? 0) / 100), 0);
  const sent = metrics.reduce((s, m) => s + m.emails_sent, 0);
  const replies = metrics.reduce((s, m) => s + m.replies, 0);
  const hot = prospects.filter((p) => !["won", "lost", "do_not_contact"].includes(p.status)).slice(0, 6);
  const attention = threads.filter((t) => t.needs_attention);

  return (
    <>
      <PageHeader title="Good day, WebCraft" description="What your agents found, what's waiting on you, and where the pipeline stands." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Awaiting your approval" value={pending.length} hint="Nothing is sent or posted without you" tone="sun" />
        <Stat label="Prospects in CRM" value={prospects.length} hint={`${prospects.filter((p) => (p.current_score ?? 0) >= 75).length} scored 75+`} tone="accent" />
        <Stat label="Reply rate (30 days)" value={sent ? `${Math.round((replies / sent) * 100)}%` : "—"} hint={`${replies} replies · ${sent} emails sent`} tone="teal" />
        <Stat label="Weighted pipeline" value={fmtTTD(weighted)} hint={`${open.length} open opportunities`} tone="ok" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Hottest prospects" description="Ranked by lead score" action={<Link href="/crm" className="text-xs text-muted hover:text-fg">Open CRM →</Link>} />
          {hot.length ? (
            <ul className="divide-y divide-border">
              {hot.map((p) => (
                <li key={p.id}>
                  <Link href={`/crm/${p.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2/50">
                    <span className="text-lg" aria-hidden>{flag(p.country_code)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.business_name}</p>
                      <p className="truncate text-xs text-muted">{p.opportunities[0]?.rationale ?? p.summary}</p>
                    </div>
                    <StatusBadge status={p.status} />
                    <ScoreBar score={p.current_score} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Flame className="h-5 w-5" />} title="No prospects yet" body="Lead Discovery runs every morning, or you can start a run from the Lead Discovery page." />
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Needs you" />
            <ul className="divide-y divide-border text-sm">
              {pending.slice(0, 3).map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-sun" />
                  <Link href="/approvals" className="min-w-0 flex-1 hover:underline"><p className="truncate">{a.title}</p><p className="truncate text-xs text-muted">{a.summary}</p></Link>
                </li>
              ))}
              {attention.slice(0, 3).map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3">
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <Link href={`/inbox?thread=${t.id}`} className="min-w-0 flex-1 hover:underline"><p className="truncate">{t.prospect}</p><p className="text-xs text-muted"><StatusBadge status={t.classification} /></p></Link>
                </li>
              ))}
              {!pending.length && !attention.length ? <li className="px-5 py-6 text-center text-xs text-muted">All clear. Nothing is waiting on you.</li> : null}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Follow-ups due" />
            <ul className="divide-y divide-border text-sm">
              {tasks.slice(0, 4).map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                  <CalendarCheck className="h-4 w-4 shrink-0 text-teal" />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-xs text-muted">{relTime(t.due_at)}</span>
                </li>
              ))}
              {!tasks.length ? <li className="px-5 py-6 text-center text-xs text-muted">No follow-ups due.</li> : null}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Instagram reach" description="Accounts reached per day, last 30 days" action={<Badge tone="neutral">Meta Insights</Badge>} />
          <div className="p-4"><LineChart data={metrics.map((m) => ({ label: m.day.slice(5), value: m.reach }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Followers" description="Total followers, last 30 days" />
          <div className="p-4"><LineChart color="var(--chart-2)" zeroBaseline={false} data={metrics.map((m) => ({ label: m.day.slice(5), value: m.followers }))} /></div>
        </Card>
      </div>
    </>
  );
}
