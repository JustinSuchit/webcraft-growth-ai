import { ExternalLink, Lightbulb, ShieldAlert, UsersRound } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, td, th } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { ActionButton } from "@/components/app/action-button";
import { ctx, loadIgProspects } from "@/lib/data";
import { flag, fmtNum, label } from "@/lib/utils";

export const metadata = { title: "Instagram Audience Research" };

export default async function AudiencePage() {
  const c = await ctx();
  const { accounts, recommendations } = await loadIgProspects(c);
  return (
    <>
      <PageHeader
        title="Instagram Audience Research"
        description="Caribbean accounts worth engaging with genuinely, and strategy recommendations. You follow and engage manually."
        actions={<ActionButton demo={c.demo} variant="primary" endpoint="/api/agents/growth_strategist/run" successText="Research queued">Run research</ActionButton>}
      />
      <Card className="mb-6 flex items-start gap-3 p-4 text-xs text-muted">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
        <p>No automated following, unfollowing, liking, commenting or DMs — those break Instagram’s terms and put the account at risk. Follower counts come from Meta’s official Business Discovery API when connected.</p>
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Accounts to review" />
          {accounts.length ? (
            <Table>
              <thead className="border-b border-border"><tr><th className={th}>Account</th><th className={th}>Why</th><th className={th}>Followers</th><th className={th}>Status</th><th className={th}></th></tr></thead>
              <tbody className="divide-y divide-border">
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className={td}><p className="font-medium">@{a.username}</p><p className="text-xs text-muted">{a.country_code ? flag(a.country_code) : ""} {a.display_name} · <Badge>{label(a.category ?? "community")}</Badge></p></td>
                    <td className={`${td} max-w-xs text-xs`}><p>{a.reason}</p><p className="mt-1 text-muted">→ {a.suggested_engagement}</p></td>
                    <td className={`${td} tabular text-xs`}>{a.followers_count != null ? fmtNum(a.followers_count) : "—"}<p className="text-[10px] text-muted">{a.data_source === "business_discovery" ? "via Meta API" : "web research"}</p></td>
                    <td className={td}><StatusBadge status={a.review_status} /></td>
                    <td className={td}><a href={`https://www.instagram.com/${a.username}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-teal hover:underline">Open <ExternalLink className="h-3 w-3" /></a></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState icon={<UsersRound className="h-5 w-5" />} title="No accounts yet" body="Run research to build a curated list." />}
        </Card>
        <Card>
          <CardHeader title="Recommendations" />
          <ul className="divide-y divide-border">
            {recommendations.length ? recommendations.map((r, i) => (
              <li key={i} className="p-4 text-sm">
                <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-sun" /><span className="font-medium">{r.title}</span></div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{r.detail}</p>
                <Badge className="mt-2">{label(r.type)}</Badge>
              </li>
            )) : <li className="p-6 text-center text-xs text-muted">Recommendations appear after the first research run.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
