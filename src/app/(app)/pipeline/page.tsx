import { Card, PageHeader, Stat } from "@/components/ui";
import { ctx, loadOpportunities } from "@/lib/data";
import { fmtTTD, label } from "@/lib/utils";

export const metadata = { title: "Opportunities & Pipeline" };
const STAGES = ["qualified", "interested", "meeting_requested", "proposal_sent", "negotiating", "won", "lost"];

export default async function PipelinePage() {
  const c = await ctx();
  const opps = await loadOpportunities(c);
  const open = opps.filter((o) => !["won", "lost"].includes(o.stage));
  const won = opps.filter((o) => o.stage === "won");
  const closed = opps.filter((o) => ["won", "lost"].includes(o.stage)).length;
  return (
    <>
      <PageHeader title="Opportunities & Pipeline" description="Deals created from interested replies and meeting requests. Values in TT dollars." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open pipeline" value={fmtTTD(open.reduce((s, o) => s + (o.value_ttd ?? 0), 0))} tone="accent" />
        <Stat label="Weighted" value={fmtTTD(open.reduce((s, o) => s + (o.value_ttd ?? 0) * ((o.probability ?? 0) / 100), 0))} tone="sun" hint="Value × probability" />
        <Stat label="Won" value={fmtTTD(won.reduce((s, o) => s + (o.value_ttd ?? 0), 0))} tone="ok" hint={`${won.length} deals`} />
        <Stat label="Win rate" value={closed ? `${Math.round((won.length / closed) * 100)}%` : "—"} tone="teal" hint={`${closed} closed`} />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const items = opps.filter((o) => o.stage === stage);
          return (
            <div key={stage} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1 text-xs">
                <span className="font-semibold">{label(stage)}</span>
                <span className="tabular text-muted">{items.length} · {fmtTTD(items.reduce((s, o) => s + (o.value_ttd ?? 0), 0))}</span>
              </div>
              <div className="min-h-32 space-y-2 rounded-2xl bg-surface-2/60 p-2">
                {items.map((o) => (
                  <Card key={o.id} className="p-3">
                    <p className="text-sm font-medium">{o.title}</p>
                    <p className="text-xs text-muted">{o.prospect}</p>
                    <div className="mt-2 flex items-center justify-between text-xs"><span className="tabular font-semibold">{o.value_ttd ? fmtTTD(o.value_ttd) : "—"}</span><span className="text-muted">{o.probability ?? 0}%</span></div>
                  </Card>
                ))}
                {!items.length ? <p className="px-2 py-6 text-center text-[11px] text-muted">Empty</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
