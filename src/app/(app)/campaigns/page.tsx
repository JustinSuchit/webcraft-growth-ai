import { Megaphone } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, td, th } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { CampaignForm } from "@/components/app/campaign-form";
import { ctx, loadCampaigns } from "@/lib/data";
import { label, relTime } from "@/lib/utils";

export const metadata = { title: "Sales Campaigns" };

export default async function CampaignsPage() {
  const c = await ctx();
  const campaigns = await loadCampaigns(c);
  return (
    <>
      <PageHeader title="Sales Campaigns" description="Group prospects into a campaign and approve it once, with an exact recipient list, daily cap and total cap. The database refuses anything outside those limits." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Campaigns" />
          {campaigns.length ? (
            <Table>
              <thead className="border-b border-border"><tr><th className={th}>Campaign</th><th className={th}>Services</th><th className={th}>Limits</th><th className={th}>Sent</th><th className={th}>Replies</th><th className={th}>Status</th></tr></thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((x) => (
                  <tr key={x.id}>
                    <td className={td}><p className="font-medium">{x.name}</p><p className="text-xs text-muted">Created {relTime(x.created_at)}</p></td>
                    <td className={td}><div className="flex flex-wrap gap-1">{x.services.map((s) => <Badge key={s} tone="teal">{label(s)}</Badge>)}</div></td>
                    <td className={`${td} tabular text-xs text-muted`}>{x.daily_cap}/day · {x.total_cap} max</td>
                    <td className={`${td} tabular`}>{x.sent}</td>
                    <td className={`${td} tabular`}>{x.replies}{x.sent ? <span className="ml-1 text-xs text-muted">({Math.round((x.replies / x.sent) * 100)}%)</span> : null}</td>
                    <td className={td}><StatusBadge status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState icon={<Megaphone className="h-5 w-5" />} title="No campaigns yet" body="Create one from qualified prospects. Without a campaign, every email is approved individually." />}
        </Card>
        <Card>
          <CardHeader title="New campaign" description="Recipients are snapshotted from qualified prospects with a verified email" />
          <CampaignForm demo={c.demo} />
        </Card>
      </div>
    </>
  );
}
