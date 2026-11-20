import "server-only";
import { env } from "@/lib/env";
import { consumeApproval, ApprovalError } from "@/lib/approvals";
import { getCredential, markCredentialError } from "@/lib/credentials";
import { complianceFooter, unsubscribeUrl } from "@/lib/compliance/outreach-rules";
import { gmailAccessToken, gmailSend } from "@/lib/integrations/mail/gmail";
import { smtpSend } from "@/lib/integrations/mail/smtp";
import { IntegrationError } from "@/lib/integrations/errors";
import { signToken } from "@/lib/signing";
import { adminClient, logActivity } from "@/lib/supabase/admin";
import { newMessageId } from "@/lib/agents/sales-rep";
import type { EmailMessage, SenderIdentityRow } from "@/lib/db/types";

const BUSINESS_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Send one outbound email. Order matters:
 *   1. consume_approval() — DB validates approval, content hash, scope, caps, suppression.
 *   2. status → 'sending' — DB trigger re-checks that a usage was recorded.
 *   3. provider send, then status → 'sent'.
 * A stable RFC Message-ID is persisted before sending so a crash-and-retry can be detected.
 */
export async function sendApprovedEmail(orgId: string, messageId: string) {
  const db = adminClient();
  const { data: msg } = await db.from("email_messages").select("*").eq("id", messageId).eq("organization_id", orgId).single<EmailMessage>();
  if (!msg) throw new ApprovalError("message not found");
  if (msg.status === "sent") return { alreadySent: true };
  if (!["approved", "sending", "failed", "awaiting_approval"].includes(msg.status)) throw new ApprovalError(`message is ${msg.status}`);
  if (!msg.to_email || !msg.subject || !msg.body_text) throw new ApprovalError("message incomplete");

  let approvalId = msg.approval_id;
  if (!approvalId && msg.campaign_id) {
    const { data: c } = await db.from("outreach_campaigns").select("approval_id").eq("id", msg.campaign_id).single();
    approvalId = c?.approval_id ?? null;
  }
  if (!approvalId) throw new ApprovalError("no approval covers this message");

  // Org-level daily cap on top of per-approval caps.
  const { data: org } = await db.from("organizations").select("settings, sender_identity").eq("id", orgId).single();
  const cap = Number((org?.settings as { daily_email_cap?: number })?.daily_email_cap ?? 40);
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await db.from("email_messages").select("id", { count: "exact", head: true })
    .eq("organization_id", orgId).eq("direction", "outbound").eq("status", "sent").gte("sent_at", since.toISOString());
  if ((sentToday ?? 0) >= cap) throw new IntegrationError("outreach", "organization daily email cap reached", false, 6 * 3600);

  await consumeApproval(approvalId, "email_messages", msg.id);

  const identity = (org?.sender_identity ?? {}) as SenderIdentityRow;
  const gmail = await getCredential(orgId, "gmail");
  const smtpUrl = env().SMTP_URL;
  if (!gmail && !smtpUrl) throw new IntegrationError("outreach", "no email integration connected", true);

  const fromAddr = gmail?.account_label ?? identity.replyTo;
  if (!fromAddr) throw new IntegrationError("outreach", "no sender address configured", true);
  const domain = fromAddr.split("@")[1] ?? "webcraft.tt";
  const rfcId = msg.rfc_message_id ?? newMessageId(domain);

  const { error: upErr } = await db.from("email_messages")
    .update({ status: "sending", approval_id: approvalId, rfc_message_id: rfcId, from_email: fromAddr })
    .eq("id", msg.id);
  if (upErr) throw new ApprovalError(upErr.message);

  const secret = env().STATE_SIGNING_SECRET;
  if (!secret) throw new IntegrationError("outreach", "STATE_SIGNING_SECRET missing (needed for unsubscribe links)", true);
  const unsub = unsubscribeUrl(env().APP_URL, signToken({ o: orgId, e: msg.to_email }, secret));
  const text = msg.body_text + "\n" + complianceFooter({
    legalName: identity.legalName ?? "WebCraft TT",
    senderName: identity.senderName ?? "WebCraft TT team",
    postalAddress: identity.postalAddress ?? "Trinidad and Tobago",
    website: identity.website ?? "https://webcraft.tt",
  }, unsub);

  const { data: thread } = msg.thread_id ? await db.from("email_threads").select("provider_thread_id").eq("id", msg.thread_id).single() : { data: null };
  const mail = {
    from: identity.senderName ? `${identity.senderName} <${fromAddr}>` : fromAddr,
    to: msg.to_email,
    subject: msg.subject,
    text,
    messageId: rfcId,
    inReplyTo: msg.in_reply_to ?? undefined,
    references: msg.in_reply_to ?? undefined,
    listUnsubscribeUrl: unsub,
    listUnsubscribeMailto: fromAddr,
  };

  try {
    let providerId: string;
    let providerThreadId: string | null = thread?.provider_thread_id ?? null;
    if (gmail) {
      const { refresh_token } = JSON.parse(gmail.secret) as { refresh_token: string };
      let token: string;
      try {
        token = await gmailAccessToken(refresh_token);
      } catch (e) {
        if (e instanceof IntegrationError && e.permanent) await markCredentialError(gmail.id, "expired");
        throw e;
      }
      const sent = await gmailSend(token, mail, providerThreadId ?? undefined);
      providerId = sent.id;
      providerThreadId = sent.threadId;
    } else {
      providerId = (await smtpSend(smtpUrl!, mail)).id;
    }

    let threadId = msg.thread_id;
    if (!threadId) {
      const { data: t } = await db.from("email_threads").upsert({
        organization_id: orgId, prospect_id: msg.prospect_id, contact_id: msg.contact_id, campaign_id: msg.campaign_id,
        provider_thread_id: providerThreadId ?? `smtp:${rfcId}`, subject: msg.subject, last_message_at: new Date().toISOString(),
      }, { onConflict: "organization_id,provider_thread_id" }).select("id").single();
      threadId = t?.id ?? null;
    } else {
      await db.from("email_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
    }

    await db.from("email_messages").update({ status: "sent", provider_message_id: providerId, thread_id: threadId, sent_at: new Date().toISOString(), error: null }).eq("id", msg.id);
    if (msg.prospect_id) {
      await db.from("prospects").update({ status: "contacted", next_follow_up_at: new Date(Date.now() + 5 * BUSINESS_DAY_MS).toISOString() })
        .eq("id", msg.prospect_id).in("status", ["researched", "qualified", "awaiting_approval"]);
      await db.from("follow_up_tasks").insert({
        organization_id: orgId, prospect_id: msg.prospect_id, title: `Check for reply: ${msg.subject}`,
        kind: "follow_up", due_at: new Date(Date.now() + 5 * BUSINESS_DAY_MS).toISOString(), created_by: "agent:sales_rep",
      });
    }
    await logActivity(orgId, { type: "system" }, "email.sent", { type: "email_messages", id: msg.id }, { to: msg.to_email, approvalId });
    return { sent: true, providerId };
  } catch (err) {
    await db.from("email_messages").update({ status: "failed", error: (err as Error).message.slice(0, 1000) }).eq("id", msg.id);
    throw err;
  }
}
