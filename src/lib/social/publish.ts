import "server-only";
import { consumeApproval, ApprovalError } from "@/lib/approvals";
import { getCredential } from "@/lib/credentials";
import { containerStatus, createContainer, publishContainer, publishingQuota } from "@/lib/integrations/meta";
import { IntegrationError } from "@/lib/integrations/errors";
import { Reschedule } from "@/lib/jobs/backoff";
import { adminClient, logActivity } from "@/lib/supabase/admin";
import type { SocialPost } from "@/lib/db/types";
import { composeCaption } from "./caption";

/**
 * Multi-step, resumable publish (state in publishing_jobs):
 *   create_container → await_container (poll, Reschedule while IN_PROGRESS) → publish → done.
 * Approval is consumed once, before any call to Meta; the DB trigger blocks 'publishing' otherwise.
 */
export async function publishPost(orgId: string, postId: string) {
  const db = adminClient();
  const { data: post } = await db.from("social_posts").select("*").eq("id", postId).eq("organization_id", orgId).single<SocialPost>();
  if (!post) throw new ApprovalError("post not found");
  if (post.status === "published") return { alreadyPublished: true };

  const approvalId = post.approval_id ?? (await findScheduleApproval(orgId, post));
  if (!approvalId) throw new ApprovalError("no approval covers this post");
  await consumeApproval(approvalId, "social_posts", post.id);
  if (post.status !== "publishing") {
    const { error } = await db.from("social_posts").update({ status: "publishing", approval_id: approvalId }).eq("id", post.id);
    if (error) throw new ApprovalError(error.message);
  }

  const cred = await getCredential(orgId, "meta_instagram");
  const { data: account } = await db.from("instagram_accounts").select("ig_user_id").eq("id", post.instagram_account_id ?? "").maybeSingle();
  if (!cred || !account) throw new IntegrationError("meta", "Instagram account not connected", true);
  const token = (JSON.parse(cred.secret) as { page_token: string }).page_token;

  await db.from("publishing_jobs").upsert({ organization_id: orgId, social_post_id: post.id }, { onConflict: "social_post_id", ignoreDuplicates: true });
  const { data: job } = await db.from("publishing_jobs").select("*").eq("social_post_id", post.id).single();

  try {
    if (job!.step === "create_container") {
      const quota = await publishingQuota(account.ig_user_id, token);
      if (quota.total && quota.used >= quota.total) throw new IntegrationError("meta", "24h publishing quota reached", false, 3600);
      const { data: assets } = await db.from("content_assets").select("id, storage_path, is_ai_generated, kind").in("id", post.asset_ids);
      const ordered = post.asset_ids.map((id) => assets!.find((a) => a.id === id)!).filter(Boolean);
      if (post.media_type === "REELS" && !ordered.some((a) => a.kind === "video")) throw new IntegrationError("meta", "Reel has no uploaded video asset", true);
      const urls = await Promise.all(ordered.map(async (a) => {
        const { data } = await db.storage.from("content").createSignedUrl(a.storage_path!, 3600);
        if (!data) throw new IntegrationError("storage", "could not sign asset URL");
        return data.signedUrl;
      }));
      const { containerId, childIds } = await createContainer(account.ig_user_id, token, {
        mediaType: post.media_type,
        caption: composeCaption(post.caption, post.hashtags),
        mediaUrls: urls,
        isAiGenerated: ordered.some((a) => a.is_ai_generated),
      });
      await db.from("publishing_jobs").update({ step: "await_container", container_id: containerId, child_container_ids: childIds }).eq("id", job!.id);
      job!.step = "await_container";
      job!.container_id = containerId;
    }

    if (job!.step === "await_container") {
      const st = await containerStatus(job!.container_id!, token);
      if (st.status_code === "IN_PROGRESS") throw new Reschedule(60, "container processing");
      if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
        await db.from("publishing_jobs").update({ step: "create_container", container_id: null, last_error: st.status ?? st.status_code }).eq("id", job!.id);
        throw new IntegrationError("meta", `container ${st.status_code}: ${st.status ?? ""}`);
      }
      await db.from("publishing_jobs").update({ step: "publish" }).eq("id", job!.id);
      job!.step = "publish";
    }

    if (job!.step === "publish") {
      const { mediaId, permalink } = await publishContainer(account.ig_user_id, job!.container_id!, token);
      await db.from("publishing_jobs").update({ step: "done" }).eq("id", job!.id);
      await db.from("social_posts").update({ status: "published", ig_media_id: mediaId, permalink, published_at: new Date().toISOString(), error: null }).eq("id", post.id);
      await logActivity(orgId, { type: "system" }, "instagram.published", { type: "social_posts", id: post.id }, { permalink, approvalId });
      return { published: true, permalink };
    }
    return { step: job!.step };
  } catch (err) {
    if (!(err instanceof Reschedule)) {
      await db.from("publishing_jobs").update({ attempts: (job!.attempts ?? 0) + 1, last_error: (err as Error).message.slice(0, 1000) }).eq("id", job!.id);
      if (err instanceof IntegrationError && err.permanent) await db.from("social_posts").update({ status: "failed", error: err.message }).eq("id", post.id);
    }
    throw err;
  }
}

async function findScheduleApproval(orgId: string, post: SocialPost) {
  const { data } = await adminClient().from("approval_requests").select("id, scope")
    .eq("organization_id", orgId).eq("kind", "publishing_schedule").eq("status", "approved").gt("expires_at", new Date().toISOString());
  return data?.find((a) => ((a.scope as { posts?: { id: string }[] }).posts ?? []).some((p) => p.id === post.id))?.id ?? null;
}
