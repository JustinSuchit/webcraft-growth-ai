import "server-only";
import { adminClient, logActivity } from "@/lib/supabase/admin";

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Agents may only *request* approvals. Requests are inserted as pending; the database rejects
 * any attempt to insert or set an approved state without a signed-in owner/admin.
 */
export async function requestEmailApproval(orgId: string, messageId: string, requestedBy: string, agentRunId?: string) {
  const db = adminClient();
  const { data: msg, error } = await db.from("email_messages").select("id, to_email, subject, content_hash").eq("id", messageId).single();
  if (error || !msg) throw new ApprovalError("message not found");
  const { data: approval, error: aErr } = await db
    .from("approval_requests")
    .insert({
      organization_id: orgId,
      kind: "email_message",
      title: `Email to ${msg.to_email}`,
      summary: msg.subject,
      target_type: "email_messages",
      target_id: msg.id,
      content_hash: msg.content_hash,
      max_uses: 1,
      expires_at: new Date(Date.now() + 14 * DAY).toISOString(),
      requested_by: requestedBy,
      agent_run_id: agentRunId ?? null,
    })
    .select("id")
    .single();
  if (aErr || !approval) throw new ApprovalError(aErr?.message ?? "could not create approval");
  await db.from("email_messages").update({ status: "awaiting_approval", approval_id: approval.id }).eq("id", messageId);
  await notifyApprovers(orgId, "Email awaiting approval", `To ${msg.to_email}: ${msg.subject}`, "/approvals");
  return approval.id as string;
}

export async function requestCampaignApproval(
  orgId: string,
  campaign: { id: string; name: string; dailyCap: number; totalCap: number; endsAt?: string },
  recipientContactIds: string[],
  requestedBy: string,
) {
  if (recipientContactIds.length === 0) throw new ApprovalError("campaign has no recipients");
  const maxUses = Math.min(campaign.totalCap, recipientContactIds.length);
  const db = adminClient();
  const { data, error } = await db
    .from("approval_requests")
    .insert({
      organization_id: orgId,
      kind: "email_campaign",
      title: `Campaign: ${campaign.name}`,
      summary: `${recipientContactIds.length} recipients · max ${maxUses} emails · ${campaign.dailyCap}/day`,
      target_type: "outreach_campaigns",
      target_id: campaign.id,
      scope: { campaign_id: campaign.id, recipient_contact_ids: recipientContactIds, daily_cap: campaign.dailyCap },
      max_uses: maxUses,
      expires_at: campaign.endsAt ?? new Date(Date.now() + 30 * DAY).toISOString(),
      requested_by: requestedBy,
    })
    .select("id")
    .single();
  if (error || !data) throw new ApprovalError(error?.message ?? "could not create approval");
  await db.from("outreach_campaigns").update({ status: "awaiting_approval", approval_id: data.id }).eq("id", campaign.id);
  await notifyApprovers(orgId, "Campaign awaiting approval", campaign.name, "/approvals");
  return data.id as string;
}

export async function requestPostApproval(orgId: string, postId: string, requestedBy: string) {
  const db = adminClient();
  const { data: post } = await db.from("social_posts").select("id, caption, content_hash, scheduled_for").eq("id", postId).single();
  if (!post) throw new ApprovalError("post not found");
  const { data, error } = await db
    .from("approval_requests")
    .insert({
      organization_id: orgId,
      kind: "social_post",
      title: "Instagram post",
      summary: (post.caption as string).slice(0, 140),
      target_type: "social_posts",
      target_id: post.id,
      content_hash: post.content_hash,
      max_uses: 1,
      expires_at: new Date(Math.max(Date.now() + 7 * DAY, new Date(post.scheduled_for ?? Date.now()).getTime() + DAY)).toISOString(),
      requested_by: requestedBy,
    })
    .select("id")
    .single();
  if (error || !data) throw new ApprovalError(error?.message ?? "could not create approval");
  await db.from("social_posts").update({ status: "awaiting_approval", approval_id: data.id }).eq("id", postId);
  return data.id as string;
}

/** A schedule approval binds an explicit list of posts *and their current content hashes*. */
export async function requestScheduleApproval(orgId: string, postIds: string[], maxPerWeek: number, requestedBy: string, expiresAt: string) {
  const db = adminClient();
  const { data: posts } = await db.from("social_posts").select("id, content_hash").in("id", postIds).eq("organization_id", orgId);
  if (!posts?.length) throw new ApprovalError("no posts");
  const { data, error } = await db
    .from("approval_requests")
    .insert({
      organization_id: orgId,
      kind: "publishing_schedule",
      title: `Publishing schedule (${posts.length} posts)`,
      summary: `Up to ${maxPerWeek} posts/week until ${expiresAt.slice(0, 10)}`,
      scope: { posts: posts.map((p) => ({ id: p.id, hash: p.content_hash })), max_per_week: maxPerWeek },
      max_uses: posts.length,
      expires_at: expiresAt,
      requested_by: requestedBy,
    })
    .select("id")
    .single();
  if (error || !data) throw new ApprovalError(error?.message ?? "could not create approval");
  return data.id as string;
}

/** The only path to an external action. Throws ApprovalError when the DB refuses. */
export async function consumeApproval(approvalId: string, targetType: "email_messages" | "social_posts", targetId: string) {
  const { error } = await adminClient().rpc("consume_approval", {
    p_approval_id: approvalId,
    p_target_type: targetType,
    p_target_id: targetId,
  });
  if (error) throw new ApprovalError(error.message);
}

async function notifyApprovers(orgId: string, title: string, body: string, link: string) {
  await adminClient().from("notifications").insert({ organization_id: orgId, kind: "approval", title, body, link });
  await logActivity(orgId, { type: "system" }, "approval.requested", { type: "approval_requests" }, { title });
}
