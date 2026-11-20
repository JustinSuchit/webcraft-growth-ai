"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bot, CalendarDays, CheckSquare, Gauge, Inbox, KanbanSquare, Megaphone, Palette, Radar, Settings, Users, UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem { href: string; label: string; icon: LucideIcon; badgeKey?: "approvals" }

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Sales", items: [
    { href: "/", label: "Overview", icon: Gauge },
    { href: "/leads", label: "Lead Discovery", icon: Radar },
    { href: "/crm", label: "Prospect CRM", icon: Users },
    { href: "/campaigns", label: "Sales Campaigns", icon: Megaphone },
    { href: "/inbox", label: "Email Inbox", icon: Inbox },
    { href: "/approvals", label: "Approval Queue", icon: CheckSquare, badgeKey: "approvals" },
    { href: "/pipeline", label: "Opportunities", icon: KanbanSquare },
  ]},
  { group: "Instagram", items: [
    { href: "/studio", label: "Content Studio", icon: Palette },
    { href: "/calendar", label: "Content Calendar", icon: CalendarDays },
    { href: "/audience", label: "Audience Research", icon: UsersRound },
  ]},
  { group: "Insights", items: [
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/agents", label: "Agent Activity", icon: Bot },
    { href: "/settings", label: "Integrations & Settings", icon: Settings },
  ]},
];

export function SideNav({ pendingApprovals }: { pendingApprovals: number }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-6">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                      active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-muted group-hover:text-fg")} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badgeKey && pendingApprovals > 0 ? (
                      <span className="tabular rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-fg">{pendingApprovals}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2 lg:hidden">
      {NAV.flatMap((g) => g.items).map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={cn("shrink-0 rounded-md px-2.5 py-1 text-xs", active ? "bg-surface-2 font-medium" : "text-muted")}>
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
