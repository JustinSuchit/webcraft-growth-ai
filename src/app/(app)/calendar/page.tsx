import { Card, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { ActionButton } from "@/components/app/action-button";
import { ctx, loadOrg, loadPosts } from "@/lib/data";
import { cn, label } from "@/lib/utils";

export const metadata = { title: "Content Calendar" };
const TT = (d: Date) => new Date(d.getTime() - 4 * 3600_000); // TT is UTC-4 year-round

export default async function CalendarPage() {
  const c = await ctx();
  const [posts, org] = await Promise.all([loadPosts(c), loadOrg(c)]);
  const perWeek = (org.settings as { posts_per_week?: number }).posts_per_week ?? 4;
  const today = TT(new Date());
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - today.getUTCDay()));
  const days = Array.from({ length: 21 }, (_, i) => new Date(start.getTime() + i * 86400_000));
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const upcomingDrafts = posts.filter((p) => ["draft", "awaiting_approval"].includes(p.status) && p.scheduled_for).map((p) => p.id);

  return (
    <>
      <PageHeader
        title="Content Calendar"
        description={`Target: ${perWeek} posts per week. Posts publish at their slot only if approved individually or covered by an approved schedule.`}
        actions={<ActionButton demo={c.demo} endpoint="/api/posts/schedule-approval" body={{ postIds: upcomingDrafts, maxPerWeek: perWeek }} successText="Schedule sent for approval">Request schedule approval ({upcomingDrafts.length})</ActionButton>}
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-medium uppercase tracking-wider text-muted">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const items = posts.filter((p) => p.scheduled_for && key(TT(new Date(p.scheduled_for))) === key(d));
            const isToday = key(d) === key(today);
            return (
              <div key={key(d)} className={cn("min-h-28 border-b border-r border-border p-2", isToday && "bg-accent/5")}>
                <p className={cn("tabular text-xs", isToday ? "font-semibold text-accent" : "text-muted")}>{d.getUTCDate()}</p>
                <div className="mt-1 space-y-1">
                  {items.map((p) => (
                    <div key={p.id} className="rounded-md border border-border bg-surface p-1.5 text-[11px]">
                      <p className="line-clamp-2 font-medium">{p.caption.split("\n")[0]}</p>
                      <div className="mt-1 flex items-center justify-between gap-1"><span className="text-muted">{label(p.media_type.toLowerCase())}</span><StatusBadge status={p.status} /></div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
