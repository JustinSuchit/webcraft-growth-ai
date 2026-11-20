import { Bot } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, Table, td, th } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { ActionButton } from "@/components/app/action-button";
import { ctx, loadRuns } from "@/lib/data";
import { label, relTime } from "@/lib/utils";

export const metadata = { title: "Agent Activity" };

const AGENTS = [
  { kind: "lead_discovery", name: "Lead Discovery", does: "Finds and researches Caribbean businesses with evidence.", schedule: "Daily 7:00am" },
  { kind: "sales_rep", name: "Sales Representative", does: "Drafts personalised outreach, classifies replies, drafts follow-ups.", schedule: "On new qualified leads & replies" },
  { kind: "crm_manager", name: "CRM Manager", does: "Scores leads, creates follow-ups, writes the daily brief.", schedule: "Daily 7:30am" },
  { kind: "content_creator", name: "Instagram Content Creator", does: "Plans posts, renders graphics, writes captions and Reel scripts.", schedule: "Thursdays" },
  { kind: "growth_strategist", name: "Instagram Growth Strategist", does: "Researches accounts to engage and recommends strategy.", schedule: "Mondays" },
];

export default async function AgentsPage() {
  const c = await ctx();
  const { runs, jobs } = await loadRuns(c);
  const spend = runs.reduce((s, r) => s + r.cost_usd, 0);
  return (
    <>
      <PageHeader title="Agent Activity" description={`Every agent run, its outcome and estimated API cost (US$${spend.toFixed(2)} across the runs shown).`} />
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {AGENTS.map((a) => (
          <Card key={a.kind} className="flex flex-col p-4">
            <Bot className="h-5 w-5 text-accent" />
            <p className="mt-2 text-sm font-semibold">{a.name}</p>
            <p className="mt-1 flex-1 text-xs text-muted">{a.does}</p>
            <p className="mt-2 text-[11px] text-muted">{a.schedule}</p>
            {["lead_discovery", "content_creator", "growth_strategist", "crm_manager"].includes(a.kind) ? (
              <div className="mt-3"><ActionButton demo={c.demo} size="sm" endpoint={`/api/agents/${a.kind}/run`} successText="Queued">Run now</ActionButton></div>
            ) : null}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Recent runs" />
        {runs.length ? (
          <Table>
            <thead className="border-b border-border"><tr><th className={th}>Agent</th><th className={th}>Result</th><th className={th}>Trigger</th><th className={th}>Duration</th><th className={th}>Cost</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-border">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className={td}><p className="font-medium">{r.agent}</p><p className="text-xs text-muted">{relTime(r.started_at)}</p></td>
                  <td className={`${td} max-w-md text-xs text-muted`}>{r.summary}</td>
                  <td className={`${td} text-xs`}>{label(r.trigger)}</td>
                  <td className={`${td} tabular text-xs`}>{r.duration_s}s</td>
                  <td className={`${td} tabular text-xs`}>${r.cost_usd.toFixed(3)}</td>
                  <td className={td}><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState icon={<Bot className="h-5 w-5" />} title="No runs yet" body="Runs appear here as soon as the scheduler or you trigger an agent." />}
      </Card>
      {jobs.length ? (
        <Card className="mt-6">
          <CardHeader title="Background jobs" description="Durable queue with retries and exponential backoff" />
          <Table>
            <thead className="border-b border-border"><tr><th className={th}>Job</th><th className={th}>Attempts</th><th className={th}>Next run</th><th className={th}>Last error</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-border">
              {jobs.map((j) => (
                <tr key={j.id}><td className={`${td} font-mono text-xs`}>{j.job_type}</td><td className={`${td} tabular text-xs`}>{j.attempts}</td><td className={`${td} text-xs`}>{relTime(j.run_at)}</td><td className={`${td} max-w-sm truncate text-xs text-danger`}>{j.last_error ?? ""}</td><td className={td}><StatusBadge status={j.status} /></td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
