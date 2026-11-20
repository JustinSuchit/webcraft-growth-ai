import "server-only";
import { getCredential } from "@/lib/credentials";
import { accountInsights, mediaInsights } from "@/lib/integrations/meta";
import { adminClient } from "@/lib/supabase/admin";

/** Pull yesterday's account insights and lifetime insights for posts from the last 30 days. */
export async function syncMetrics(orgId: string) {
  const db = adminClient();
  const cred = await getCredential(orgId, "meta_instagram");
  const { data: accounts } = await db.from("instagram_accounts").select("id, ig_user_id").eq("organization_id", orgId);
  if (!cred || !accounts?.length) return { skipped: "instagram not connected" };
  const token = (JSON.parse(cred.secret) as { page_token: string }).page_token;

  const until = new Date(); until.setUTCHours(0, 0, 0, 0);
  const since = new Date(until.getTime() - 86400_000);
  const day = since.toISOString().slice(0, 10);
  let rows = 0;

  for (const acct of accounts) {
    const m = await accountInsights(acct.ig_user_id, token, since, until);
    const accountRows = Object.entries(m).map(([metric, value]) => ({
      organization_id: orgId, instagram_account_id: acct.id, scope: "account", metric, value, period_start: day,
    }));
    // Re-runs for the same day replace that day's values (idempotent).
    await db.from("social_metrics").delete().eq("instagram_account_id", acct.id).eq("scope", "account").eq("period_start", day);
    await db.from("social_metrics").insert(accountRows);
    await db.from("instagram_accounts").update({ followers_count: m.follower_count, media_count: m.media_count }).eq("id", acct.id);
    rows += accountRows.length;

    const { data: posts } = await db.from("social_posts").select("id, ig_media_id, published_at")
      .eq("instagram_account_id", acct.id).eq("status", "published").gte("published_at", new Date(Date.now() - 30 * 86400_000).toISOString());
    for (const p of posts ?? []) {
      if (!p.ig_media_id) continue;
      const mm = await mediaInsights(p.ig_media_id, token);
      const mediaRows = Object.entries(mm).map(([metric, value]) => ({
        organization_id: orgId, instagram_account_id: acct.id, social_post_id: p.id, scope: "media", metric, value,
        period_start: p.published_at!.slice(0, 10),
      }));
      // Lifetime metrics: delete+insert keeps the latest value per post/metric.
      await db.from("social_metrics").delete().eq("social_post_id", p.id).eq("scope", "media");
      await db.from("social_metrics").insert(mediaRows);
      rows += mediaRows.length;
    }
  }
  return { rows };
}
