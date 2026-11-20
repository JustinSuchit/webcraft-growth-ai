/**
 * Outreach compliance rules applied to every drafted email before it can be queued for approval.
 * These are guardrails, not legal advice — see docs/SECURITY.md for the policy they implement.
 */
export interface SenderIdentity {
  legalName: string;      // "WebCraft TT"
  senderName: string;     // the human who owns the mailbox
  postalAddress: string;
  website: string;
}

export interface Draft { subject: string; bodyText: string }

const BANNED_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /\bguarantee[sd]?\b.*\b(rank|traffic|sales|revenue|#?1)\b/i, reason: "No guaranteed rankings/results" },
  { re: /\b(as|per) (we|i) discussed\b|\bfollowing up on our call\b/i, reason: "Implies a prior conversation that did not happen" },
  { re: /\bre:\s/i, reason: "Fake reply prefix in a first-touch subject" },
  { re: /\b(urgent|act now|final notice|last chance)\b/i, reason: "High-pressure language" },
  { re: /\b(i am|i'm) a (real )?(person|human)\b/i, reason: "Must not claim to be human" },
  { re: /\btestimonial\b|\bour client .* said\b/i, reason: "Testimonials must come from the verified portfolio, not drafts" },
];

export function checkDraft(d: Draft, isFirstTouch: boolean): string[] {
  const issues: string[] = [];
  const text = `${d.subject}\n${d.bodyText}`;
  for (const { re, reason } of BANNED_PATTERNS) {
    if (re.source.includes("re:") && !isFirstTouch) continue;
    if (re.test(text)) issues.push(reason);
  }
  if (d.subject.length > 90) issues.push("Subject longer than 90 characters");
  if (d.bodyText.length > 2500) issues.push("Body too long for a first-touch email");
  if (/\{\{|\[insert|\[name\]|lorem ipsum/i.test(text)) issues.push("Unfilled template placeholder");
  return issues;
}

export function unsubscribeUrl(appUrl: string, token: string) {
  return `${appUrl.replace(/\/$/, "")}/api/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** Footer appended server-side so a draft cannot omit it. */
export function complianceFooter(id: SenderIdentity, unsubscribe: string) {
  return [
    "",
    "—",
    `${id.senderName} · ${id.legalName} · ${id.website}`,
    id.postalAddress,
    "This message was drafted with AI assistance on behalf of WebCraft TT; replies are read by our team.",
    `Not interested? Reply "unsubscribe" or opt out here: ${unsubscribe}`,
  ].join("\n");
}
