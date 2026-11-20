import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { IntegrationError } from "./errors";

/**
 * Official Instagram API with Facebook Login (Instagram Professional account linked to a Facebook Page).
 * Permissions requested — each requires Meta App Review for production use (see docs/META.md).
 */
export const META_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

const graph = () => `https://graph.facebook.com/${env().META_GRAPH_VERSION}`;

function proof(token: string) {
  return createHmac("sha256", env().META_APP_SECRET ?? "").update(token).digest("hex");
}

async function call<T>(method: "GET" | "POST", path: string, token: string, params: Record<string, string | boolean | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams({ access_token: token, appsecret_proof: proof(token) });
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const url = method === "GET" ? `${graph()}${path}?${qs}` : `${graph()}${path}`;
  const res = await fetch(url, method === "POST" ? { method, body: qs } : undefined);
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message: string; code: number; error_subcode?: number; is_transient?: boolean } };
  if (!res.ok || json.error) {
    const e = json.error;
    // 4/17/32/613 = rate limiting; transient flag from Meta; 5xx = retry
    const rateLimited = e && [4, 17, 32, 613].includes(e.code);
    const permanent = !rateLimited && !e?.is_transient && res.status < 500;
    throw new IntegrationError("meta", `${e?.message ?? `HTTP ${res.status}`} (code ${e?.code ?? "?"})`, permanent, rateLimited ? 900 : undefined);
  }
  return json;
}

export function metaAuthorizeUrl(state: string) {
  const e = env();
  const p = new URLSearchParams({
    client_id: e.META_APP_ID ?? "",
    redirect_uri: `${e.APP_URL}/api/integrations/meta/callback`,
    state,
    scope: META_SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/${e.META_GRAPH_VERSION}/dialog/oauth?${p}`;
}

export interface ConnectedIgAccount { igUserId: string; username: string; pageId: string; pageToken: string; followers: number; mediaCount: number }

export async function exchangeMetaCode(code: string): Promise<ConnectedIgAccount[]> {
  const e = env();
  const shortRes = await fetch(`${graph()}/oauth/access_token?${new URLSearchParams({
    client_id: e.META_APP_ID ?? "", client_secret: e.META_APP_SECRET ?? "",
    redirect_uri: `${e.APP_URL}/api/integrations/meta/callback`, code,
  })}`);
  if (!shortRes.ok) throw new IntegrationError("meta", "code exchange failed", true);
  const short = (await shortRes.json()) as { access_token: string };
  const longRes = await fetch(`${graph()}/oauth/access_token?${new URLSearchParams({
    grant_type: "fb_exchange_token", client_id: e.META_APP_ID ?? "", client_secret: e.META_APP_SECRET ?? "", fb_exchange_token: short.access_token,
  })}`);
  if (!longRes.ok) throw new IntegrationError("meta", "long-lived token exchange failed", true);
  const long = (await longRes.json()) as { access_token: string };
  // Page tokens derived from a long-lived user token do not expire (until revoked / password change).
  const pages = await call<{ data: { id: string; access_token: string; instagram_business_account?: { id: string; username: string; followers_count: number; media_count: number } }[] }>(
    "GET", "/me/accounts", long.access_token, { fields: "id,name,access_token,instagram_business_account{id,username,followers_count,media_count}" },
  );
  return pages.data.flatMap((p) => p.instagram_business_account ? [{
    igUserId: p.instagram_business_account.id,
    username: p.instagram_business_account.username,
    pageId: p.id,
    pageToken: p.access_token,
    followers: p.instagram_business_account.followers_count,
    mediaCount: p.instagram_business_account.media_count,
  }] : []);
}

// --- Publishing -------------------------------------------------------------

export interface PublishInput {
  mediaType: "IMAGE" | "CAROUSEL" | "REELS";
  caption: string;
  mediaUrls: string[]; // publicly fetchable (signed) URLs; images must be JPEG
  isAiGenerated: boolean;
}

export async function createContainer(igUserId: string, token: string, input: PublishInput): Promise<{ containerId: string; childIds: string[] }> {
  const ai = input.isAiGenerated ? true : undefined; // applies Instagram's "AI info" label
  if (input.mediaType === "IMAGE") {
    const r = await call<{ id: string }>("POST", `/${igUserId}/media`, token, { image_url: input.mediaUrls[0], caption: input.caption, is_ai_generated: ai });
    return { containerId: r.id, childIds: [] };
  }
  if (input.mediaType === "REELS") {
    const r = await call<{ id: string }>("POST", `/${igUserId}/media`, token, { media_type: "REELS", video_url: input.mediaUrls[0], caption: input.caption, is_ai_generated: ai });
    return { containerId: r.id, childIds: [] };
  }
  if (input.mediaUrls.length < 2 || input.mediaUrls.length > 10) throw new IntegrationError("meta", "carousel needs 2–10 items", true);
  const childIds: string[] = [];
  for (const url of input.mediaUrls) {
    const c = await call<{ id: string }>("POST", `/${igUserId}/media`, token, { image_url: url, is_carousel_item: true, is_ai_generated: ai });
    childIds.push(c.id);
  }
  const r = await call<{ id: string }>("POST", `/${igUserId}/media`, token, { media_type: "CAROUSEL", children: childIds.join(","), caption: input.caption });
  return { containerId: r.id, childIds };
}

export async function containerStatus(containerId: string, token: string) {
  const r = await call<{ status_code: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED"; status?: string }>(
    "GET", `/${containerId}`, token, { fields: "status_code,status" },
  );
  return r;
}

export async function publishContainer(igUserId: string, containerId: string, token: string) {
  const r = await call<{ id: string }>("POST", `/${igUserId}/media_publish`, token, { creation_id: containerId });
  const m = await call<{ permalink: string }>("GET", `/${r.id}`, token, { fields: "permalink" });
  return { mediaId: r.id, permalink: m.permalink };
}

export async function publishingQuota(igUserId: string, token: string) {
  const r = await call<{ data: { quota_usage: number; config: { quota_total: number } }[] }>(
    "GET", `/${igUserId}/content_publishing_limit`, token, { fields: "quota_usage,config" },
  );
  const d = r.data[0];
  return { used: d?.quota_usage ?? 0, total: d?.config.quota_total ?? 0 };
}

// --- Insights & research -----------------------------------------------------

export const ACCOUNT_METRICS = ["reach", "views", "total_interactions", "accounts_engaged", "profile_links_taps"];
export const MEDIA_METRICS = ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"];

export async function accountInsights(igUserId: string, token: string, since: Date, until: Date) {
  const r = await call<{ data: { name: string; total_value?: { value: number } }[] }>("GET", `/${igUserId}/insights`, token, {
    metric: ACCOUNT_METRICS.join(","), period: "day", metric_type: "total_value",
    since: String(Math.floor(since.getTime() / 1000)), until: String(Math.floor(until.getTime() / 1000)),
  });
  const profile = await call<{ followers_count: number; media_count: number }>("GET", `/${igUserId}`, token, { fields: "followers_count,media_count" });
  const metrics: Record<string, number> = { follower_count: profile.followers_count, media_count: profile.media_count };
  for (const m of r.data) metrics[m.name] = m.total_value?.value ?? 0;
  return metrics;
}

export async function mediaInsights(mediaId: string, token: string) {
  const r = await call<{ data: { name: string; values: { value: number }[] }[] }>("GET", `/${mediaId}/insights`, token, { metric: MEDIA_METRICS.join(",") });
  return Object.fromEntries(r.data.map((m) => [m.name, m.values[0]?.value ?? 0])) as Record<string, number>;
}

/** Public profile data for another Business/Creator account via the official Business Discovery API. */
export async function businessDiscovery(igUserId: string, token: string, username: string) {
  const safe = username.replace(/[^a-zA-Z0-9._]/g, "");
  const r = await call<{ business_discovery: { username: string; name?: string; biography?: string; followers_count?: number; media_count?: number; website?: string } }>(
    "GET", `/${igUserId}`, token, { fields: `business_discovery.username(${safe}){username,name,biography,followers_count,media_count,website}` },
  );
  return r.business_discovery;
}
