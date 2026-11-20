/** Build an RFC 5322 plain-text message, base64url-encoded for the Gmail API `raw` field. */
export interface OutgoingMail {
  from: string;          // "Name <addr>"
  to: string;
  subject: string;
  text: string;
  messageId: string;     // "<uuid@webcraft.tt>"
  inReplyTo?: string;
  references?: string;
  listUnsubscribeUrl: string;
  listUnsubscribeMailto?: string;
}

function encodeHeader(v: string) {
  // RFC 2047 for non-ASCII (e.g. accented names); strip CR/LF to prevent header injection.
  const clean = v.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean).toString("base64")}?=`;
}

export function buildMime(m: OutgoingMail): string {
  const unsub = [m.listUnsubscribeMailto ? `<mailto:${m.listUnsubscribeMailto}?subject=unsubscribe>` : null, `<${m.listUnsubscribeUrl}>`]
    .filter(Boolean)
    .join(", ");
  const headers = [
    `From: ${encodeHeader(m.from)}`,
    `To: ${encodeHeader(m.to)}`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Message-ID: ${m.messageId}`,
    m.inReplyTo ? `In-Reply-To: ${m.inReplyTo}` : null,
    m.references ? `References: ${m.references}` : null,
    `List-Unsubscribe: ${unsub}`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  const body = Buffer.from(m.text.replace(/\r?\n/g, "\r\n")).toString("base64").replace(/(.{76})/g, "$1\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export const toBase64Url = (s: string) => Buffer.from(s).toString("base64url");
