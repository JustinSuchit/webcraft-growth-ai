import "server-only";
import nodemailer from "nodemailer";
import type { OutgoingMail } from "./mime";

/** Send-only alternative to Gmail. Reply monitoring requires the Gmail integration (or forwarding to it). */
export async function smtpSend(smtpUrl: string, m: OutgoingMail) {
  const transport = nodemailer.createTransport(smtpUrl);
  const info = await transport.sendMail({
    from: m.from,
    to: m.to,
    subject: m.subject,
    text: m.text,
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
    references: m.references,
    list: { unsubscribe: { url: m.listUnsubscribeUrl, comment: "Unsubscribe" } },
    headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  return { id: info.messageId };
}
