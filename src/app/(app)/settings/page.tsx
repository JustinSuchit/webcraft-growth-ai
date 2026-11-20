import { CheckCircle2, CircleDashed } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/app/settings-form";
import { ctx, loadIntegrations, loadOrg } from "@/lib/data";
import { integrationStatus } from "@/lib/env";

export const metadata = { title: "Integrations & Settings" };

export default async function SettingsPage() {
  const c = await ctx();
  const [org, creds] = await Promise.all([loadOrg(c), loadIntegrations(c)]);
  const env = integrationStatus();
  const connected = (p: string) => creds.find((x) => x.provider === p && x.status === "connected");
  const rows = [
    { name: "Supabase", desc: "Database, auth, storage, row-level security", ok: env.supabase, how: "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and run the migrations." },
    { name: "Anthropic Claude", desc: "Research, drafting, classification, content", ok: env.anthropic, how: "Set ANTHROPIC_API_KEY (server-side only)." },
    { name: "Gmail", desc: connected("gmail")?.account_label ?? "Sending and reply monitoring", ok: Boolean(connected("gmail")), how: env.gmail ? "Click Connect Gmail below." : "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, then connect.", connect: env.gmail && !c.demo ? "/api/integrations/gmail/start" : null },
    { name: "Instagram (Meta)", desc: connected("meta_instagram")?.account_label ?? "Publishing and insights via the official API", ok: Boolean(connected("meta_instagram")), how: env.meta ? "Click Connect Instagram below." : "Set META_APP_ID / META_APP_SECRET, then connect. See docs/META.md for App Review.", connect: env.meta && !c.demo ? "/api/integrations/meta/start" : null },
    { name: "Image generation", desc: env.imageAi ? "OpenAI images enabled (posts get Instagram's AI label)" : "Brand templates (no AI images)", ok: true, how: "Optional: IMAGE_PROVIDER=openai and OPENAI_API_KEY." },
    { name: "Scheduler", desc: "Vercel Cron → /api/cron/tick every 5 min, /api/cron/daily", ok: env.cron, how: "Set CRON_SECRET; Vercel sends it as a Bearer token." },
  ];
  return (
    <>
      <PageHeader title="Integrations & Settings" description="Connections, automation targets and sender identity. Secrets are stored in Supabase Vault and never shown here." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Integrations" />
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.name} className="flex items-start gap-3 px-5 py-4">
                {r.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-ok" /> : <CircleDashed className="mt-0.5 h-5 w-5 text-muted" />}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center gap-2"><span className="font-medium">{r.name}</span>{r.ok ? <Badge tone="ok">Connected</Badge> : <Badge>Not connected</Badge>}</div>
                  <p className="text-xs text-muted">{r.desc}</p>
                  {!r.ok ? <p className="mt-1 text-xs text-muted">{r.how}</p> : null}
                </div>
                {r.connect ? <a href={r.connect} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2">{r.ok ? "Reconnect" : "Connect"}</a> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Automation & sender identity" description="Owners and admins only" />
          <SettingsForm demo={c.demo} canEdit={c.role === "owner" || c.role === "admin"} settings={org.settings as Record<string, number>} identity={org.sender_identity as Record<string, string>} />
        </Card>
      </div>
    </>
  );
}
