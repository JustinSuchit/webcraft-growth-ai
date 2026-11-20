/**
 * Minimal robots.txt evaluator (RFC 9309 subset: user-agent groups, allow/disallow,
 * longest-match wins, `*` and `$` wildcards). Used before any direct fetch of a prospect site.
 */
export const USER_AGENT = "WebCraftGrowthBot/1.0 (+https://webcraft.tt/bot)";
const UA_TOKEN = "webcraftgrowthbot";

interface Rule { allow: boolean; pattern: string }

export function parseRobots(txt: string, uaToken = UA_TOKEN): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value || key === "allow") current.rules.push({ allow: key === "allow", pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && uaToken.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules).filter((r) => r.pattern !== "");
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

export function isAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (toRegex(r.pattern).test(path)) {
      if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
    }
  }
  return best ? best.allow : true;
}

export async function robotsAllows(url: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const u = new URL(url);
  try {
    const res = await fetcher(`${u.origin}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
    if (res.status >= 400 && res.status < 500) return true; // no robots.txt → allowed
    if (!res.ok) return false; // server error → be conservative
    return isAllowed(parseRobots(await res.text()), u.pathname || "/");
  } catch {
    return false;
  }
}
