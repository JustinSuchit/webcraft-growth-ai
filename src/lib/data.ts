import "server-only";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";
import * as demo from "@/lib/demo/data";

/**
 * Page data loaders. Real mode reads through the user-scoped client (RLS enforced).
 * Demo mode returns the labelled sample dataset. Shapes are identical so pages don't branch.
 */
export async function ctx() {
  if (isDemoMode()) return { demo: true as const, orgId: "demo", role: "owner" as const, email: "demo@webcraft.example" };
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: m } = await supabase.from("organization_members").select("organization_id, role").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (!m) redirect("/onboarding");
  return { demo: false as const, orgId: m.organization_id as string, role: m.role as "owner" | "admin" | "member" | "viewer", email: data.user.email ?? "", supabase };
}

type Ctx = Awaited<ReturnType<typeof ctx>>;
const sb = (c: Ctx) => (c.demo ? null : c.supabase);

export async function loadProspects(c: Ctx, f: { status?: string; country?: string; industry?: string; q?: string } = {}) {
  const s = sb(c);
  if (!s) {
    return demo.demoProspects.filter((p) =>
      (!f.status || p.status === f.status) && (!f.country || p.country_code === f.country) &&
      (!f.industry || p.industry === f.industry) && (!f.q || p.business_name.toLowerCase().includes(f.q.toLowerCase())));
  }
  let q = s.from("prospects").select("*, prospect_research(summary, opportunities, website_observations, researched_at)")
    .eq("organization_id", c.orgId).order("current_score", { ascending: false, nullsFirst: false }).limit(200);
  if (f.status) q = q.eq("status", f.status);
  if (f.country) q = q.eq("country_code", f.country);
  if (f.industry) q = q.eq("industry", f.industry);
  if (f.q) q = q.ilike("business_name", `%${f.q}%`);
  const { data } = await q;
  return (data ?? []).map((p) => {
    const r = (p.prospect_research as { summary: string; opportunities: demo.DemoProspect["opportunities"]; website_observations: Record<string, unknown> }[] | null)?.[0];
    return { ...p, summary: r?.summary ?? "", opportunities: r?.opportunities ?? [], observations: r?.website_observations ?? {} } as demo.DemoProspect;
  });
}

export async function loadApprovals(c: Ctx) {
  const s = sb(c);
  if (!s) return demo.demoApprovals;
  const { data } = await s.from("approval_requests").select("*").eq("organization_id", c.orgId).order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  const msgIds = rows.filter((r) => r.target_type === "email_messages").map((r) => r.target_id);
  const { data: msgs } = msgIds.length ? await s.from("email_messages").select("id, body_text").in("id", msgIds) : { data: [] };
  return rows.map((r) => ({ ...r, body: msgs?.find((m) => m.id === r.target_id)?.body_text ?? null })) as (typeof demo.demoApprovals)[number][];
}

export async function loadCampaigns(c: Ctx) {
  const s = sb(c);
  if (!s) return demo.demoCampaigns;
  const { data } = await s.from("outreach_campaigns").select("*, email_messages(status, direction)").eq("organization_id", c.orgId).order("created_at", { ascending: false });
  return (data ?? []).map((x) => {
    const msgs = (x.email_messages ?? []) as { status: string; direction: string }[];
    return { ...x, sent: msgs.filter((m) => m.direction === "outbound" && m.status === "sent").length, replies: msgs.filter((m) => m.direction === "inbound").length };
  }) as typeof demo.demoCampaigns;
}

export async function loadThreads(c: Ctx) {
  const s = sb(c);
  if (!s) return demo.demoThreads;
  const { data } = await s.from("email_threads")
    .select("id, subject, last_classification, needs_attention, last_message_at, prospects(business_name), email_messages(direction, from_email, body_text, status, sent_at, received_at, created_at, id)")
    .eq("organization_id", c.orgId).order("last_message_at", { ascending: false }).limit(100);
  return (data ?? []).map((t) => {
    const msgs = ((t.email_messages ?? []) as { id: string; direction: string; from_email: string; body_text: string; status: string; sent_at: string | null; received_at: string | null; created_at: string }[])
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const draft = msgs.find((m) => m.direction === "outbound" && ["draft", "awaiting_approval"].includes(m.status));
    return {
      id: t.id, prospect: (t.prospects as unknown as { business_name: string } | null)?.business_name ?? "—", subject: t.subject ?? "",
      classification: t.last_classification ?? "other", needs_attention: t.needs_attention, last_message_at: t.last_message_at ?? "",
      messages: msgs.filter((m) => m.status === "sent" || m.status === "received").map((m) => ({ direction: m.direction, from: m.from_email, body: m.body_text, at: m.sent_at ?? m.received_at ?? m.created_at })),
      draft: draft?.body_text ?? null,
    };
  });
}

export async function loadOpportunities(c: Ctx) {
  const s = sb(c);
  if (!s) return demo.demoOpportunities;
  const { data } = await s.from("opportunities").select("*, prospects(business_name)").eq("organization_id", c.orgId);
  return (data ?? []).map((o) => ({ ...o, prospect: (o.prospects as unknown as { business_name: string } | null)?.business_name ?? "—" })) as typeof demo.demoOpportunities;
}

export async function loadPosts(c: Ctx) {
  const s = sb(c);
  if (!s) return demo.demoPosts;
  const { data } = await s.from("social_posts").select("*, content_ideas(title)").eq("organization_id", c.orgId).order("scheduled_for", { ascending: true }).limit(100);
  const assetIds = (data ?? []).flatMap((p) => p.asset_ids as string[]);
  const { data: assets } = assetIds.length ? await s.from("content_assets").select("id, spec").in("id", assetIds) : { data: [] };
  return (data ?? []).map((p) => ({
    ...p,
    slides: (p.asset_ids as string[]).map((id) => assets?.find((a) => a.id === id)?.spec).filter(Boolean),
  })) as typeof demo.demoPosts;
}

export async function loadIgProspects(c: Ctx) {
  const s = sb(c);
  if (!s) return { accounts: demo.demoIgProspects, recommendations: demo.demoRecommendations };
  const [{ data: accounts }, { data: run }] = await Promise.all([
    s.from("instagram_prospects").select("*").eq("organization_id", c.orgId).neq("review_status", "dismissed").order("researched_at", { ascending: false }).limit(100),
    s.from("agent_runs").select("output, agents!inner(kind)").eq("organization_id", c.orgId).eq("agents.kind", "growth_strategist").eq("status", "succeeded").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { accounts: (accounts ?? []) as typeof demo.demoIgProspects, recommendations: ((run?.output as { recommendations?: typeof demo.demoRecommendations })?.recommendations ?? []) };
}

export async function loadMetrics(c: Ctx) {
  const s = sb(c);
  if (!s) return demo.demoMetrics;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [{ data: m }, { data: sent }, { data: replies }] = await Promise.all([
    s.from("social_metrics").select("metric, value, period_start").eq("organization_id", c.orgId).eq("scope", "account").gte("period_start", since),
    s.from("email_messages").select("sent_at").eq("organization_id", c.orgId).eq("status", "sent").gte("sent_at", since),
    s.from("email_messages").select("received_at").eq("organization_id", c.orgId).eq("direction", "inbound").gte("received_at", since),
  ]);
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 86400_000).toISOString().slice(0, 10));
  const val = (day: string, metric: string) => Number(m?.find((x) => x.period_start === day && x.metric === metric)?.value ?? 0);
  return days.map((day) => ({
    day, followers: val(day, "follower_count"), reach: val(day, "reach"), views: val(day, "views"),
    interactions: val(day, "total_interactions"), link_taps: val(day, "profile_links_taps"),
    emails_sent: (sent ?? []).filter((x) => x.sent_at?.startsWith(day)).length,
    replies: (replies ?? []).filter((x) => x.received_at?.startsWith(day)).length,
  }));
}

export async function loadRuns(c: Ctx) {
  const s = sb(c);
  if (!s) return { runs: demo.demoRuns, jobs: [] as { id: string; job_type: string; status: string; attempts: number; last_error: string | null; run_at: string }[] };
  const [{ data: runs }, { data: jobs }] = await Promise.all([
    s.from("agent_runs").select("id, status, trigger, output, error, cost_usd, started_at, finished_at, agents(name)").eq("organization_id", c.orgId).order("created_at", { ascending: false }).limit(50),
    s.from("scheduled_jobs").select("id, job_type, status, attempts, last_error, run_at").eq("organization_id", c.orgId).order("updated_at", { ascending: false }).limit(30),
  ]);
  return {
    runs: (runs ?? []).map((r) => ({
      id: r.id, agent: (r.agents as unknown as { name: string } | null)?.name ?? "—", status: r.status, trigger: r.trigger,
      summary: r.error ?? summarise(r.output), cost_usd: Number(r.cost_usd), started_at: r.started_at ?? "",
      duration_s: r.finished_at && r.started_at ? Math.round((+new Date(r.finished_at) - +new Date(r.started_at)) / 1000) : 0,
    })),
    jobs: jobs ?? [],
  };
}

function summarise(o: unknown) {
  if (!o || typeof o !== "object") return "";
  return Object.entries(o as Record<string, unknown>).filter(([, v]) => typeof v === "number" || typeof v === "string").slice(0, 4).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(" · ");
}

export async function loadTasks(c: Ctx) {
  const s = sb(c);
  if (!s) return demo.demoTasks;
  const { data } = await s.from("follow_up_tasks").select("id, title, kind, due_at").eq("organization_id", c.orgId).is("completed_at", null).order("due_at").limit(20);
  return data ?? [];
}

export async function loadIntegrations(c: Ctx) {
  const s = sb(c);
  if (!s) return [];
  const { data } = await s.from("integration_credentials_metadata").select("provider, account_label, status, scopes, last_verified_at").eq("organization_id", c.orgId);
  return data ?? [];
}

export async function loadOrg(c: Ctx) {
  const s = sb(c);
  if (!s) return { name: "WebCraft TT (demo)", settings: { daily_prospect_target: 10, posts_per_week: 4, daily_email_cap: 40 }, sender_identity: {} };
  const { data } = await s.from("organizations").select("name, settings, sender_identity").eq("id", c.orgId).single();
  return data!;
}
