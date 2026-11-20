export const dynamic = "force-dynamic";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { ctx } from "@/lib/data";
import { MobileNav, SideNav } from "@/components/app/nav";
import { ThemeToggle } from "@/components/app/theme";
import { demoApprovals } from "@/lib/demo/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const c = await ctx();
  let pending = 0;
  if (c.demo) pending = demoApprovals.filter((a) => a.status === "pending").length;
  else {
    const { count } = await c.supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("organization_id", c.orgId).eq("status", "pending");
    pending = count ?? 0;
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        <Link href="/" className="mb-7 flex items-center gap-2.5 px-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-fg text-[13px] font-black text-bg">W</span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">WebCraft Growth</span>
            <span className="block text-[11px] text-muted">Sales & social agents</span>
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SideNav pendingApprovals={pending} />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border px-3 pt-4">
          <span className="truncate text-xs text-muted">{c.email}</span>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {c.demo ? (
          <div className="flex items-center gap-2 border-b border-sun/30 bg-sun/10 px-5 py-2 text-xs text-fg">
            <FlaskConical className="h-3.5 w-3.5 text-sun" />
            <span>
              <strong>Demo mode.</strong> Showing fictional sample data (<code>.example</code> domains). Nothing is researched, sent or published.{" "}
              <Link href="/settings" className="underline underline-offset-2">Connect services</Link> to go live.
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 lg:hidden">
          <span className="text-sm font-semibold">WebCraft Growth</span>
          <ThemeToggle />
        </div>
        <MobileNav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
