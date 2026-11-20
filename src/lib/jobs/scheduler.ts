import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { enqueue } from "./queue";

/** Every 5 minutes: enqueue due sends/publishes and reply sync. Idempotency keys make re-runs harmless. */
export async function scheduleTick() {
  const db = adminClient();
  const now = new Date();
  const { data: orgs } = await db.from("organizations").select("id");
  for (const org of orgs ?? []) {
    const { data: schedules } = await db.from("approval_requests").select("scope").eq("organization_id", org.id)
      .eq("kind", "publishing_schedule").eq("status", "approved").gt("expires_at", now.toISOString());
    const scheduled = new Set((schedules ?? []).flatMap((a) => ((a.scope as { posts?: { id: string }[] }).posts ?? []).map((p) => p.id)));
    const { data: due } = await db.from("social_posts").select("id, status").eq("organization_id", org.id)
      .in("status", ["approved", "scheduled", "awaiting_approval", "draft", "publishing"]).lte("scheduled_for", now.toISOString()).limit(20);
    // Individually approved posts, or posts inside an approved schedule. consume_approval() still has the final say.
    for (const p of (due ?? []).filter((p) => ["approved", "scheduled", "publishing"].includes(p.status) || scheduled.has(p.id))) {
      await enqueue(org.id, "social.publish", { postId: p.id }, `publish:${p.id}`, now, 8);
    }

    const { data: queued } = await db.from("email_messages").select("id").eq("organization_id", org.id)
      .eq("direction", "outbound").eq("status", "approved").order("created_at").limit(10);
    // Spread sends ~2 minutes apart to look like (and be) considerate, human-paced outreach.
    for (const [i, m] of (queued ?? []).entries()) await enqueue(org.id, "outreach.send", { messageId: m.id }, `send:${m.id}`, new Date(now.getTime() + i * 120_000), 6);

    const slot = Math.floor(now.getTime() / (15 * 60_000));
    await enqueue(org.id, "outreach.sync_replies", {}, `replies:${slot}`, now, 2);
  }
}

/** Once a day (07:00 TT): lead discovery, daily brief, metrics; weekly content plan and growth research. */
export async function scheduleDaily() {
  const db = adminClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekday = new Date().getUTCDay();
  const { data: orgs } = await db.from("organizations").select("id, settings");
  for (const org of orgs ?? []) {
    const s = (org.settings ?? {}) as { daily_prospect_target?: number };
    await enqueue(org.id, "lead_discovery.run", { target: s.daily_prospect_target ?? 10 }, `leads:${today}`, new Date(), 3);
    await enqueue(org.id, "crm.daily_summary", {}, `summary:${today}`, new Date(Date.now() + 30 * 60_000), 3);
    await enqueue(org.id, "social.sync_metrics", {}, `metrics:${today}`);
    if (weekday === 4) await enqueue(org.id, "content.plan_week", {}, `content:${today}`, new Date(), 3); // Thursday → review before Monday
    if (weekday === 1) await enqueue(org.id, "growth.research", {}, `growth:${today}`, new Date(), 3);
  }
}
