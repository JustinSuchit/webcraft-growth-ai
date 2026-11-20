import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, ScoreBar } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { ActionButton } from "@/components/app/action-button";
import { ProspectStatusForm } from "@/components/app/prospect-status-form";
import { ctx, loadProspects } from "@/lib/data";
import { COUNTRY, flag, label, relTime } from "@/lib/utils";

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await ctx();
  const p = (await loadProspects(c)).find((x) => x.id === id);
  if (!p) notFound();

  let history: { action: string; created_at: string; actor_type: string }[] = [];
  let scores: { score: number; service_fit: number; verified_need: number; contact_quality: number; engagement: number; buying_intent: number; rationale: string | null } | null = null;
  let evidence: string[] = p.opportunities.map((o) => o.evidence_url);
  if (!c.demo) {
    const [{ data: h }, { data: s }, { data: r }] = await Promise.all([
      c.supabase.from("activity_logs").select("action, created_at, actor_type, entity_type").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
      c.supabase.from("lead_scores").select("*").eq("prospect_id", id).order("scored_at", { ascending: false }).limit(1).maybeSingle(),
      c.supabase.from("prospect_research").select("evidence_urls").eq("prospect_id", id).order("researched_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    history = h ?? [];
    scores = s;
    evidence = (r?.evidence_urls as string[]) ?? evidence;
  }
  const obs = p.observations as Record<string, unknown>;

  return (
    <>
      <Link href="/crm" className="text-xs text-muted hover:text-fg">← Prospect CRM</Link>
      <PageHeader
        title={p.business_name}
        description={`${flag(p.country_code)} ${p.city ?? ""}, ${COUNTRY[p.country_code] ?? p.country_code} · ${label(p.industry)}`}
        actions={<>
          <StatusBadge status={p.status} />
          {p.status !== "do_not_contact" ? (
            <ActionButton demo={c.demo} variant="primary" endpoint={`/api/prospects/${p.id}/draft`} successText="Draft queued — check the Approval Queue">Draft outreach</ActionButton>
          ) : null}
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Research" description="Verified findings from public sources" />
            <div className="space-y-4 p-5 text-sm">
              <p className="leading-relaxed">{p.summary || "No research summary yet."}</p>
              <div className="space-y-2">
                {p.opportunities.map((o, i) => (
                  <div key={i} className="rounded-xl border border-border bg-surface-2/50 p-3">
                    <Badge tone="teal">{label(o.service)}</Badge>
                    <p className="mt-1.5 text-sm">{o.rationale}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Evidence</p>
                <ul className="space-y-1 text-xs">
                  {[...new Set(evidence)].map((u) => (
                    <li key={u}><a href={u} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-teal hover:underline">{u}<ExternalLink className="h-3 w-3" /></a></li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Website check" description={obs.checkedAt ? `Checked ${relTime(String(obs.checkedAt))}` : "One robots.txt-respecting homepage fetch"} />
            <dl className="grid grid-cols-2 gap-px bg-border text-sm sm:grid-cols-3">
              {[
                ["Fetched", obs.fetched ? "Yes" : `No (${label(String(obs.skippedReason ?? "—"))})`],
                ["HTTPS", obs.https === undefined ? "—" : obs.https ? "Yes" : "No"],
                ["Mobile viewport", obs.hasViewportMeta === undefined ? "—" : obs.hasViewportMeta ? "Yes" : "Missing"],
                ["Copyright year", String(obs.copyrightYear ?? "—")],
                ["Response time", obs.responseMs ? `${obs.responseMs} ms` : "—"],
                ["Online store signals", obs.hasEcommerceSignals === undefined ? "—" : obs.hasEcommerceSignals ? "Yes" : "None found"],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface p-4"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 font-medium">{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="History" />
            <ul className="divide-y divide-border text-sm">
              {history.length ? history.map((h, i) => (
                <li key={i} className="flex justify-between px-5 py-2.5"><span>{label(h.action)} <span className="text-xs text-muted">by {h.actor_type}</span></span><span className="text-xs text-muted">{relTime(h.created_at)}</span></li>
              )) : <li className="px-5 py-6 text-center text-xs text-muted">{c.demo ? "History is recorded from real activity once connected." : "No activity yet."}</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Lead score" />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex items-center justify-between"><span className="text-3xl font-semibold tabular">{p.current_score ?? "—"}</span><ScoreBar score={p.current_score} /></div>
              {scores ? (
                <dl className="space-y-1.5 text-xs">
                  {([["Service fit", scores.service_fit, 30], ["Verified need", scores.verified_need, 25], ["Contact quality", scores.contact_quality, 15], ["Engagement", scores.engagement, 15], ["Buying intent", scores.buying_intent, 15]] as const).map(([k, v, w]) => (
                    <div key={k} className="flex justify-between"><dt className="text-muted">{k} <span className="opacity-60">×{w}%</span></dt><dd className="tabular font-medium">{v}</dd></div>
                  ))}
                  {scores.rationale ? <p className="pt-2 text-muted">{scores.rationale}</p> : null}
                </dl>
              ) : <p className="text-xs text-muted">Weighted from service fit (30%), verified need (25%), contact quality, engagement and buying intent (15% each).</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Contact & status" />
            <div className="space-y-2 p-5 text-sm">
              <p><span className="text-muted">Email:</span> {p.public_email ?? "None verified"}</p>
              {p.website_url ? <p><span className="text-muted">Website:</span> <a className="text-teal hover:underline" href={p.website_url} target="_blank" rel="noopener noreferrer nofollow">{p.website_url}</a></p> : null}
              {p.instagram_url ? <p><span className="text-muted">Instagram:</span> <a className="text-teal hover:underline" href={p.instagram_url} target="_blank" rel="noopener noreferrer nofollow">profile</a></p> : null}
              <ProspectStatusForm id={p.id} status={p.status} demo={c.demo} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
