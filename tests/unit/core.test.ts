import { describe, expect, it } from "vitest";
import { computeLeadScore, scoreBand } from "@/lib/scoring";
import { isAllowed, parseRobots, robotsAllows } from "@/lib/compliance/robots";
import { checkDraft, complianceFooter } from "@/lib/compliance/outreach-rules";
import { signToken, verifyToken } from "@/lib/signing";
import { backoffSeconds } from "@/lib/jobs/backoff";
import { nextSlots, slotsForCount } from "@/lib/social/schedule";
import { composeCaption } from "@/lib/social/caption";
import { buildMime } from "@/lib/integrations/mail/mime";
import { normalizeUrl } from "@/lib/ai/claude";
import { auditHomepage } from "@/lib/compliance/site-audit";

describe("lead scoring", () => {
  const base = { serviceFit: 80, verifiedNeed: 80, contactQuality: 80, engagement: 0, buyingIntent: 40, evidenceCount: 2, hasDeliverableContact: true, suppressed: false };
  it("applies weights", () => {
    expect(computeLeadScore(base).score).toBe(Math.round(80 * 0.3 + 80 * 0.25 + 80 * 0.15 + 0 + 40 * 0.15));
  });
  it("caps unverified need and undeliverable contacts", () => {
    const r = computeLeadScore({ ...base, evidenceCount: 0, hasDeliverableContact: false });
    expect(r.components.verifiedNeed).toBe(30);
    expect(r.components.contactQuality).toBe(20);
    expect(r.notes).toHaveLength(2);
  });
  it("zeroes suppressed prospects", () => {
    expect(computeLeadScore({ ...base, suppressed: true }).score).toBe(0);
  });
  it("clamps out-of-range components", () => {
    expect(computeLeadScore({ ...base, serviceFit: 400, buyingIntent: -5 }).components).toMatchObject({ serviceFit: 100, buyingIntent: 0 });
  });
  it("bands", () => {
    expect([scoreBand(80), scoreBand(60), scoreBand(10), scoreBand(null)]).toEqual(["hot", "warm", "cool", "unscored"]);
  });
});

describe("robots.txt", () => {
  const txt = `User-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.pdf$\n\nUser-agent: WebCraftGrowthBot\nDisallow: /no-bots\n`;
  it("prefers a group that names our bot", () => {
    const rules = parseRobots(txt);
    expect(isAllowed(rules, "/private")).toBe(true); // specific group replaces *
    expect(isAllowed(rules, "/no-bots/x")).toBe(false);
  });
  it("longest match wins, with wildcards", () => {
    const rules = parseRobots(txt, "otherbot");
    expect(isAllowed(rules, "/private/x")).toBe(false);
    expect(isAllowed(rules, "/private/ok/page")).toBe(true);
    expect(isAllowed(rules, "/files/brochure.pdf")).toBe(false);
    expect(isAllowed(rules, "/files/brochure.pdf?x")).toBe(true);
  });
  it("treats missing robots.txt as allowed and server errors as disallowed", async () => {
    const f404 = (async () => new Response("", { status: 404 })) as typeof fetch;
    const f503 = (async () => new Response("", { status: 503 })) as typeof fetch;
    expect(await robotsAllows("https://x.example/", f404)).toBe(true);
    expect(await robotsAllows("https://x.example/", f503)).toBe(false);
  });
  it("site audit skips sites whose robots.txt disallows us", async () => {
    const f = (async (u: RequestInfo | URL) => String(u).endsWith("/robots.txt")
      ? new Response("User-agent: *\nDisallow: /")
      : new Response("<html></html>")) as typeof fetch;
    expect(await auditHomepage("https://x.example", f)).toMatchObject({ fetched: false, skippedReason: "robots_disallowed" });
  });
  it("site audit records factual observations", async () => {
    const html = `<html><head><title>Coral Hardware</title><meta name="viewport" content="width=device-width"></head><body>© 2017 Coral</body></html>`;
    const f = (async (u: RequestInfo | URL) => String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response(html)) as typeof fetch;
    expect(await auditHomepage("https://x.example", f)).toMatchObject({ fetched: true, title: "Coral Hardware", hasViewportMeta: true, copyrightYear: 2017, hasEcommerceSignals: false });
  });
});

describe("outreach compliance", () => {
  it("accepts an honest, specific draft", () => {
    expect(checkDraft({ subject: "An online catalogue for Coral Hardware", bodyText: "Hi team, I noticed customers phone to check stock. A searchable catalogue could help. Open to a short call?" }, true)).toEqual([]);
  });
  it("flags deceptive patterns", () => {
    const issues = checkDraft({ subject: "Re: our call", bodyText: "As we discussed, we guarantee #1 rank on Google. Act now! Hi [name]" }, true);
    expect(issues).toEqual(expect.arrayContaining([
      "Fake reply prefix in a first-touch subject", "Implies a prior conversation that did not happen",
      "No guaranteed rankings/results", "High-pressure language", "Unfilled template placeholder",
    ]));
  });
  it("allows Re: on genuine replies", () => {
    expect(checkDraft({ subject: "Re: Website question", bodyText: "Thanks for getting back to us — happy to set up a call." }, false)).toEqual([]);
  });
  it("footer always discloses AI assistance and an opt-out", () => {
    const f = complianceFooter({ legalName: "WebCraft TT", senderName: "Alex", postalAddress: "Port of Spain", website: "https://webcraft.tt" }, "https://x/u");
    expect(f).toMatch(/AI assistance/);
    expect(f).toMatch(/https:\/\/x\/u/);
  });
});

describe("signed tokens", () => {
  const secret = "s".repeat(32);
  it("round-trips and rejects tampering or expiry", () => {
    const t = signToken({ e: "a@b.c" }, secret);
    expect(verifyToken<{ e: string }>(t, secret)?.e).toBe("a@b.c");
    expect(verifyToken(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")), secret)).toBeNull();
    expect(verifyToken(t, "x".repeat(32))).toBeNull();
    expect(verifyToken(signToken({ e: 1 }, secret, -1), secret)).toBeNull();
  });
});

describe("backoff", () => {
  it("grows exponentially within jitter bounds and caps", () => {
    expect(backoffSeconds(1, 30, 3600, () => 0)).toBe(30);
    expect(backoffSeconds(4, 30, 3600, () => 1)).toBe(240);
    expect(backoffSeconds(20, 30, 3600, () => 1)).toBe(3600);
  });
});

describe("posting schedule (Trinidad time, UTC-4)", () => {
  it("returns default 4 weekly slots at 18:00 TT", () => {
    const from = new Date("2026-11-20T13:00:00Z"); // Fri 09:00 TT
    const s = nextSlots(4, from);
    expect(s.map((d) => d.toISOString())).toEqual([
      "2026-11-21T15:00:00.000Z", // Sat 11:00 TT
      "2026-11-23T22:00:00.000Z", // Mon 18:00 TT
      "2026-11-24T22:00:00.000Z", // Tue
      "2026-11-26T22:00:00.000Z", // Thu
    ]);
  });
  it("skips taken slots and supports more posts per week", () => {
    const from = new Date("2026-11-20T13:00:00Z");
    const taken = new Set(["2026-11-21T15:00:00.000Z"]);
    expect(nextSlots(1, from, undefined, taken)[0]!.toISOString()).toBe("2026-11-23T22:00:00.000Z");
    expect(slotsForCount(6)).toHaveLength(6);
  });
});

describe("captions & MIME", () => {
  it("dedupes hashtags and caps length", () => {
    expect(composeCaption("Hello", ["#TT", "TT", "Web"])).toBe("Hello\n\n#TT #Web");
    expect(composeCaption("x".repeat(3000), []).length).toBe(2200);
  });
  it("builds a header-injection-safe message with one-click unsubscribe", () => {
    const raw = buildMime({ from: "A <a@x.tt>", to: "b@y.tt\r\nBcc: evil@z.tt", subject: "Café ☕", text: "Hi", messageId: "<1@x.tt>", listUnsubscribeUrl: "https://x/u" });
    expect(raw).not.toMatch(/\r\nBcc:/);
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(raw).toMatch(/List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  });
});

describe("evidence URL normalisation", () => {
  it("ignores www, trailing slash, fragments and utm params", () => {
    expect(normalizeUrl("https://www.Coral.example/About/?utm_source=x#top")).toBe(normalizeUrl("https://coral.example/about"));
  });
});
