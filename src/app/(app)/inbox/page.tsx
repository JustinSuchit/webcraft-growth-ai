import Link from "next/link";
import { Inbox } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { ctx, loadThreads } from "@/lib/data";
import { cn, relTime, ttDate } from "@/lib/utils";

export const metadata = { title: "Email Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const { thread } = await searchParams;
  const c = await ctx();
  const threads = await loadThreads(c);
  const active = threads.find((t) => t.id === thread) ?? threads.find((t) => t.needs_attention) ?? threads[0];

  return (
    <>
      <PageHeader title="Email Inbox" description="Replies to WebCraft outreach, classified by the Sales agent. Suggested follow-ups go to the Approval Queue — never sent automatically." />
      {threads.length ? (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {threads.map((t) => (
                <li key={t.id}>
                  <Link href={`/inbox?thread=${t.id}`} className={cn("block px-4 py-3 hover:bg-surface-2/50", active?.id === t.id && "bg-surface-2")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", t.needs_attention && "font-semibold")}>{t.prospect}</span>
                      <span className="shrink-0 text-[11px] text-muted">{relTime(t.last_message_at)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{t.subject}</p>
                    <div className="mt-1.5"><StatusBadge status={t.classification} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {active ? (
            <Card>
              <CardHeader title={active.subject} description={active.prospect} action={<StatusBadge status={active.classification} />} />
              <div className="space-y-4 p-5">
                {active.messages.length ? active.messages.map((m, i) => (
                  <div key={i} className={cn("max-w-[85%] rounded-2xl border p-4 text-sm", m.direction === "inbound" ? "border-border bg-surface-2/60" : "ml-auto border-accent/20 bg-accent/5")}>
                    <p className="mb-1.5 text-[11px] text-muted">{m.direction === "inbound" ? m.from : "WebCraft TT"} · {ttDate(m.at)}</p>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  </div>
                )) : <p className="text-center text-xs text-muted">No message bodies stored for this thread.</p>}
                {active.draft ? (
                  <div className="rounded-2xl border border-dashed border-sun/50 bg-sun/5 p-4 text-sm">
                    <p className="mb-1.5 text-[11px] font-medium text-sun">Suggested follow-up · awaiting approval</p>
                    <p className="whitespace-pre-wrap leading-relaxed">{active.draft}</p>
                    <Link href="/approvals" className="mt-3 inline-block text-xs font-medium underline underline-offset-2">Review in Approval Queue →</Link>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>
      ) : (
        <Card><EmptyState icon={<Inbox className="h-5 w-5" />} title="No conversations yet" body="Once Gmail is connected and outreach is sent, replies are synced every 15 minutes and appear here." /></Card>
      )}
    </>
  );
}
