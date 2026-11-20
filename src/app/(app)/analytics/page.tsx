import { Card, CardHeader, PageHeader, Stat, Table, td, th } from "@/components/ui";
import { BarChart, LineChart } from "@/components/app/charts";
import { ctx, loadCampaigns, loadMetrics, loadOpportunities, loadProspects } from "@/lib/data";
import { fmtNum, label } from "@/lib/utils";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const c = await ctx();
  const [m, prospects, opps, campaigns] = await Promise.all([loadMetrics(c), loadProspects(c), loadOpportunities(c), loadCampaigns(c)]);
  const sum = (k: keyof (typeof m)[number]) => m.reduce((s, r) => s + Number(r[k]), 0);
  const sent = sum("emails_sent");
  const replies = sum("replies");
  const reached = prospects.filter((p) => !["new", "researched", "qualified", "awaiting_approval"].includes(p.status)).length;
  const funnel = [
    ["Discovered", prospects.length],
    ["Qualified", prospects.filter((p) => (p.current_score ?? 0) >= 50).length],
    ["Contacted", reached],
    ["Replied", prospects.filter((p) => ["replied", "interested", "meeting_requested", "proposal_sent", "negotiating", "won"].includes(p.status)).length],
    ["Meeting+", prospects.filter((p) => ["meeting_requested", "proposal_sent", "negotiating", "won"].includes(p.status)).length],
    ["Won", opps.filter((o) => o.stage === "won").length],
  ] as const;
  const first = m[0]?.followers ?? 0;
  const last = m[m.length - 1]?.followers ?? 0;

  return (
    <>
      <PageHeader title="Analytics" description="Sales activity, conversion and Instagram performance — last 30 days." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Emails sent" value={fmtNum(sent)} tone="accent" />
        <Stat label="Reply rate" value={sent ? `${((replies / sent) * 100).toFixed(1)}%` : "—"} hint={`${replies} replies`} tone="teal" />
        <Stat label="Follower change" value={`${last - first >= 0 ? "+" : ""}${fmtNum(last - first)}`} hint={`${fmtNum(last)} followers`} tone="ok" />
        <Stat label="Profile link taps" value={fmtNum(sum("link_taps"))} hint="Website clicks from Instagram" tone="sun" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sales funnel" description="Prospects at or past each stage" />
          <div className="space-y-2.5 p-5">
            {funnel.map(([name, n]) => (
              <div key={name} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted">{name}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface-2">
                  <div className="h-full rounded-md bg-chart-1" style={{ width: `${funnel[0][1] ? (n / funnel[0][1]) * 100 : 0}%` }} />
                </div>
                <span className="tabular w-8 text-right text-xs font-semibold">{n}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Emails sent per day" />
          <div className="p-4"><BarChart data={m.map((r) => ({ label: r.day.slice(5), value: r.emails_sent }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Instagram views per day" description="Meta Insights `views` metric" />
          <div className="p-4"><LineChart data={m.map((r) => ({ label: r.day.slice(5), value: r.views }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Interactions per day" description="Likes, comments, saves, shares" />
          <div className="p-4"><LineChart color="var(--chart-2)" data={m.map((r) => ({ label: r.day.slice(5), value: r.interactions }))} /></div>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Campaign performance" />
        <Table>
          <thead className="border-b border-border"><tr><th className={th}>Campaign</th><th className={th}>Status</th><th className={th}>Sent</th><th className={th}>Replies</th><th className={th}>Reply rate</th></tr></thead>
          <tbody className="divide-y divide-border">
            {campaigns.map((x) => (
              <tr key={x.id}><td className={td}>{x.name}</td><td className={`${td} text-xs`}>{label(x.status)}</td><td className={`${td} tabular`}>{x.sent}</td><td className={`${td} tabular`}>{x.replies}</td><td className={`${td} tabular`}>{x.sent ? `${Math.round((x.replies / x.sent) * 100)}%` : "—"}</td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
