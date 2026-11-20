import "server-only";
import { getCredential } from "@/lib/credentials";
import { gmailAccessToken, gmailThread } from "@/lib/integrations/mail/gmail";
import { adminClient, logActivity } from "@/lib/supabase/admin";
import { classifyReply, looksLikeOptOut } from "@/lib/agents/sales-rep";
import { requestEmailApproval } from "@/lib/approvals";
import { rescoreFromEngagement } from "@/lib/agents/crm-manager";

const STATUS_FOR: Record<string, string> = {
  interested: "interested",
  meeting_request: "meeting_requested",
  quote_request: "interested",
  question: "replied",
  not_interested: "lost",
};

/** Poll Gmail threads we started, ingest new inbound messages, classify, and act. */
export async function syncReplies(orgId: string) {
  const db = adminClient();
  const gmail = await getCredential(orgId, "gmail");
  if (!gmail) return { skipped: "gmail not connected" };
  const token = await gmailAccessToken((JSON.parse(gmail.secret) as { refresh_token: string }).refresh_token);
  const own = (gmail.account_label ?? "").toLowerCase();

  const { data: threads } = await db.from("email_threads").select("id, provider_thread_id, prospect_id, contact_id, subject")
    .eq("organization_id", orgId).not("provider_thread_id", "like", "smtp:%")
    .gte("last_message_at", new Date(Date.now() - 45 * 86400_000).toISOString()).limit(100);

  let ingested = 0;
  for (const t of threads ?? []) {
    const msgs = await gmailThread(token, t.provider_thread_id!);
    for (const m of msgs) {
      if (m.isSent || m.from.toLowerCase().includes(own)) continue;
      const { data: exists } = await db.from("email_messages").select("id").eq("organization_id", orgId).eq("provider_message_id", m.id).maybeSingle();
      if (exists) continue;

      const fromEmail = (m.from.match(/<([^>]+)>/)?.[1] ?? m.from).trim().toLowerCase();
      const isBounce = /mailer-daemon|postmaster/i.test(fromEmail);
      const optOut = looksLikeOptOut(m.text);
      const ai = isBounce || optOut ? null : await classifyReply(m.text, `Subject: ${t.subject}`);
      const classification = isBounce ? "bounce" : optOut ? "opt_out" : ai!.data.classification;

      const { data: inbound } = await db.from("email_messages").insert({
        organization_id: orgId, thread_id: t.id, prospect_id: t.prospect_id, contact_id: t.contact_id,
        direction: "inbound", status: "received", from_email: fromEmail, to_email: own, subject: m.subject,
        body_text: m.text.slice(0, 20000), provider_message_id: m.id, rfc_message_id: m.messageId,
        in_reply_to: m.inReplyTo, classification, ai_generated: false, received_at: m.date.toISOString(),
      }).select("id").single();
      ingested++;

      await db.from("email_threads").update({
        last_message_at: m.date.toISOString(), last_classification: classification,
        needs_attention: !["opt_out", "bounce", "out_of_office"].includes(classification),
      }).eq("id", t.id);

      if (classification === "opt_out" || classification === "bounce") {
        const { data: c } = t.contact_id ? await db.from("contacts").select("email").eq("id", t.contact_id).single() : { data: null };
        const email = classification === "bounce" ? c?.email : fromEmail;
        if (email) await db.from("suppression_list").upsert({ organization_id: orgId, email, reason: classification === "bounce" ? "bounce" : "opt_out", source: `email:${inbound?.id}` }, { onConflict: "organization_id,email", ignoreDuplicates: true });
        if (classification === "opt_out" && t.prospect_id) await db.from("prospects").update({ status: "do_not_contact" }).eq("id", t.prospect_id);
        continue;
      }

      if (t.prospect_id) {
        const next = STATUS_FOR[classification];
        if (next) await db.from("prospects").update({ status: next }).eq("id", t.prospect_id).neq("status", "do_not_contact");
        await rescoreFromEngagement(orgId, t.prospect_id, classification);
      }
      if (["meeting_request", "quote_request", "interested"].includes(classification)) {
        await db.from("notifications").insert({ organization_id: orgId, kind: "hot_reply", title: `${classification.replace("_", " ")} from ${fromEmail}`, body: ai?.data.summary, link: `/inbox?thread=${t.id}` });
        await db.from("follow_up_tasks").insert({ organization_id: orgId, prospect_id: t.prospect_id, title: `Respond: ${ai?.data.summary ?? m.subject}`.slice(0, 200), kind: classification === "quote_request" ? "quote" : classification === "meeting_request" ? "meeting" : "follow_up", due_at: new Date(Date.now() + 86400_000).toISOString(), created_by: "agent:sales_rep" });
        if (classification === "meeting_request" && t.prospect_id) {
          const { data: open } = await db.from("opportunities").select("id").eq("prospect_id", t.prospect_id).limit(1).maybeSingle();
          if (!open) await db.from("opportunities").insert({ organization_id: orgId, prospect_id: t.prospect_id, title: `Opportunity: ${t.subject}`, service: "website", stage: "meeting_requested" });
        }
      }

      // Follow-up drafts are NEW communications: always single-message approval, never campaign scope.
      if (ai?.data.suggested_reply) {
        const { data: draft } = await db.from("email_messages").insert({
          organization_id: orgId, thread_id: t.id, prospect_id: t.prospect_id, contact_id: t.contact_id, campaign_id: null,
          direction: "outbound", status: "draft", to_email: fromEmail, subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
          body_text: ai.data.suggested_reply, in_reply_to: m.messageId, idempotency_key: `reply:${m.id}`,
        }).select("id").single();
        if (draft) await requestEmailApproval(orgId, draft.id, "agent:sales_rep");
      }
    }
  }
  if (ingested) await logActivity(orgId, { type: "agent", id: "sales_rep" }, "replies.synced", { type: "email_threads" }, { ingested });
  return { threads: threads?.length ?? 0, ingested };
}
