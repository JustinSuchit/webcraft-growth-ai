import Link from "next/link";
import { Users } from "lucide-react";
import { Button, Card, EmptyState, Input, PageHeader, ScoreBar, Select, Table, td, th } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { ctx, loadProspects } from "@/lib/data";
import { INDUSTRIES, PROSPECT_STATUSES } from "@/lib/db/types";
import { COUNTRY, flag, label, relTime } from "@/lib/utils";

export const metadata = { title: "Prospect CRM" };

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const f = await searchParams;
  const c = await ctx();
  const prospects = await loadProspects(c, f);
  const counts = Object.fromEntries(PROSPECT_STATUSES.map((s) => [s.value, 0]));
  (await loadProspects(c)).forEach((p) => { counts[p.status] = (counts[p.status] ?? 0) + 1; });

  return (
    <>
      <PageHeader title="Prospect CRM" description="Every company researched or contacted, with status, score and history." />
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        <Link href="/crm" className={`shrink-0 rounded-full border px-3 py-1 text-xs ${!f.status ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg"}`}>All</Link>
        {PROSPECT_STATUSES.map((s) => (
          <Link key={s.value} href={`/crm?status=${s.value}`} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${f.status === s.value ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg"}`}>
            {s.label} <span className="tabular opacity-60">{counts[s.value]}</span>
          </Link>
        ))}
      </div>
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-border p-3">
          {f.status ? <input type="hidden" name="status" value={f.status} /> : null}
          <Input name="q" defaultValue={f.q} placeholder="Search businesses…" className="max-w-xs" />
          <Select name="country" defaultValue={f.country ?? ""} className="w-48">
            <option value="">All countries</option>
            {Object.entries(COUNTRY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select name="industry" defaultValue={f.industry ?? ""} className="w-48">
            <option value="">All industries</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{label(i)}</option>)}
          </Select>
          <Button type="submit">Filter</Button>
        </form>
        {prospects.length ? (
          <Table>
            <thead className="border-b border-border"><tr><th className={th}>Business</th><th className={th}>Country</th><th className={th}>Industry</th><th className={th}>Score</th><th className={th}>Status</th><th className={th}>Next follow-up</th></tr></thead>
            <tbody className="divide-y divide-border">
              {prospects.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/40">
                  <td className={td}><Link href={`/crm/${p.id}`} className="font-medium hover:underline">{p.business_name}</Link><p className="text-xs text-muted">{p.public_email ?? "No verified email"}</p></td>
                  <td className={`${td} text-xs`}>{flag(p.country_code)} {COUNTRY[p.country_code] ?? p.country_code}</td>
                  <td className={`${td} text-xs text-muted`}>{label(p.industry)}</td>
                  <td className={td}><ScoreBar score={p.current_score} /></td>
                  <td className={td}><StatusBadge status={p.status} /></td>
                  <td className={`${td} text-xs text-muted`}>{relTime(p.next_follow_up_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No prospects match" body="Try clearing filters, or run Lead Discovery to research new businesses." />
        )}
      </Card>
    </>
  );
}
