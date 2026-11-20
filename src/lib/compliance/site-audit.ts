import { robotsAllows, USER_AGENT } from "./robots";

export interface SiteObservations {
  url: string;
  fetched: boolean;
  skippedReason?: string;
  https?: boolean;
  status?: number;
  responseMs?: number;
  hasViewportMeta?: boolean;
  title?: string | null;
  metaDescription?: string | null;
  hasOpenGraph?: boolean;
  hasEcommerceSignals?: boolean;
  copyrightYear?: number | null;
  pageWeightKb?: number;
  generator?: string | null;
  checkedAt: string;
}

/**
 * One polite request to a prospect's homepage — only if robots.txt allows it.
 * Produces factual observations that the research agent may cite; never inferred claims.
 */
export async function auditHomepage(rawUrl: string, fetcher: typeof fetch = fetch): Promise<SiteObservations> {
  const checkedAt = new Date().toISOString();
  let url: URL;
  try {
    url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { url: rawUrl, fetched: false, skippedReason: "invalid_url", checkedAt };
  }
  if (!(await robotsAllows(url.toString(), fetcher))) {
    return { url: url.toString(), fetched: false, skippedReason: "robots_disallowed", checkedAt };
  }
  const started = Date.now();
  try {
    const res = await fetcher(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    const html = (await res.text()).slice(0, 2_000_000);
    const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null;
    const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
    return {
      url: res.url || url.toString(),
      fetched: true,
      https: (res.url || url.toString()).startsWith("https://"),
      status: res.status,
      responseMs: Date.now() - started,
      hasViewportMeta: /<meta[^>]+name=["']viewport["']/i.test(html),
      title: pick(/<title[^>]*>([^<]*)<\/title>/i),
      metaDescription: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
      hasOpenGraph: /<meta[^>]+property=["']og:/i.test(html),
      hasEcommerceSignals: /(add[- ]to[- ]cart|woocommerce|shopify|checkout|cart\.js)/i.test(html),
      copyrightYear: years.length ? Math.max(...years) : null,
      pageWeightKb: Math.round(html.length / 1024),
      generator: pick(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i),
      checkedAt,
    };
  } catch (err) {
    return { url: url.toString(), fetched: false, skippedReason: `fetch_error: ${(err as Error).message}`, checkedAt };
  }
}
