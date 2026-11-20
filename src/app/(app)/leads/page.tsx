import { Radar, ShieldCheck } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, ScoreBar, Table, td, th } from "@/components/ui";
import { ActionButton } from "@/components/app/action-button";
import { StatusBadge } from "@/components/app/status";
import { ctx, loadOrg, loadProspects, loadRuns } from "@/lib/data";
import { COUNTRY, flag, label, relTime } from "@/lib/utils";

export const metadata = { title: "Lead Discovery" };

export default async function LeadsPage() {
  const c = await ctx();
  const [prospects, org, { runs }] = await Promise.all([loadProspects(c), loadOrg(c), loadRuns(c)]);
  const recent = [...prospects].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 25);
  const lastRun = runs.find((r) => r.agent === "Lead Discovery");
  const target = (org.settings as { daily_prospect_target?: number }).daily_prospect_target ?? 10;

  return (
    <>
      <PageHeader
        title="Lead Discovery"
        description={`Researches public sources daily — Trinidad & Tobago first, then the wider Caribbean. Target: ${target} new prospects per day.`}
        actions={<ActionButton demo={c.demo} variant="primary" endpoint="/api/agents/lead_discovery/run" successText="Run queued">Run discovery now</ActionButton>}
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-muted">Last run</p>
          <p className="mt-1 text-sm font-semibold">{lastRun ? relTime(lastRun.started_at) : "Never"}</p>
          <p className="mt-1 text-xs text-muted">{lastRun?.summary ?? "Runs daily at 7:00am TT time."}</p>
        </Card>
        <Card className="p-5 md:col-span-2">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-teal" />
            <div className="text-xs leading-relaxed text-muted">
              <p className="text-sm font-semibold text-fg">How research stays honest</p>
              Every fact must come from a page the agent actually retrieved. Evidence URLs are cross-checked against the search results; prospects with no verifiable evidence are discarded, and contact emails are only kept when the page they came from was retrieved. Prospect websites are fetched once, only where robots.txt allows.
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Recently discovered" description="Newest first" />
        {recent.length ? (
          <Table>
            <thead className="border-b border-border"><tr><th className={th}>Business</th><th className={th}>Industry</th><th className={th}>Opportunity</th><th className={th}>Confidence</th><th className={th}>Score</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-border">
              {recent.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/40">
                  <td className={td}>
                    <a href={`/crm/${p.id}`} className="font-medium hover:underline">{p.business_name}</a>
                    <p className="text-xs text-muted">{flag(p.country_code)} {p.city}, {COUNTRY[p.country_code] ?? p.country_code}</p>
                  </td>
                  <td className={td}><Badge>{label(p.industry)}</Badge></td>
                  <td className={`${td} max-w-sm text-xs text-muted`}>{p.opportunities[0] ? <><Badge tone="teal" className="mr-1">{label(p.opportunities[0].service)}</Badge>{p.opportunities[0].rationale}</> : "—"}</td>
                  <td className={`${td} tabular text-xs`}>{p.confidence != null ? `${Math.round(p.confidence * 100)}%` : "—"}</td>
                  <td className={td}><ScoreBar score={p.current_score} /></td>
                  <td className={td}><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Radar className="h-5 w-5" />} title="No prospects discovered yet" body="Connect the Anthropic API key and run discovery. Results appear here with their evidence and confidence." />
        )}
      </Card>
    </>
  );
}
