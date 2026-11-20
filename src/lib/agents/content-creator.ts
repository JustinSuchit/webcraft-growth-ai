import "server-only";
import { z } from "zod";
import { runStructured } from "@/lib/ai/claude";
import { imageProvider, type SlideSpec } from "@/lib/integrations/image";
import { requestPostApproval } from "@/lib/approvals";
import { nextSlots, slotsForCount } from "@/lib/social/schedule";
import { adminClient, logActivity } from "@/lib/supabase/admin";
import { finishRun, startRun } from "@/lib/jobs/runs";
import type { OrgSettings } from "@/lib/db/types";
import { WEBCRAFT_PROFILE } from "./profile";

const Slide = z.object({
  template: z.enum(["headline", "tip", "before_after", "portfolio", "cta"]),
  eyebrow: z.string().max(40).optional(),
  headline: z.string().min(3).max(90),
  body: z.string().max(220).optional(),
  asset_ids: z.array(z.string()).max(2).optional().describe("Only for before_after/portfolio: ids from the authorised asset list"),
});

const PostPlan = z.object({
  format: z.enum(["single_image", "carousel", "before_after", "portfolio", "reel"]),
  pillar: z.enum(["education", "portfolio", "promotion", "behind_the_scenes", "community"]),
  title: z.string().max(120),
  brief: z.string().max(600),
  slides: z.array(Slide).min(1).max(10),
  caption: z.string().max(2000),
  hashtags: z.array(z.string().regex(/^[A-Za-z0-9_]+$/)).max(15).describe("Without the # symbol"),
  reel_script: z.string().max(3000).nullable().describe("For reels: hook, scenes with on-screen text and voiceover, CTA. Null otherwise."),
});

const Plan = z.object({ posts: z.array(PostPlan) });

const SYSTEM = `You are the Instagram Content Creator for ${WEBCRAFT_PROFILE.name}, ${WEBCRAFT_PROFILE.description}
Services: ${Object.values(WEBCRAFT_PROFILE.services).join("; ")}.
Voice: ${WEBCRAFT_PROFILE.tone} Natural Caribbean relevance (local business realities, Trini/Caribbean references where they fit) without caricature or forced slang.

Rules:
- Never fabricate client names, testimonials, statistics, results, awards or before/after projects.
- before_after and portfolio formats are ONLY allowed using the authorised asset ids provided. If none are provided, do not use those formats.
- Educational content must be accurate and practical (e.g. what makes a site mobile-friendly, why Google Business Profile matters).
- Each caption: strong first line hook, value, a clear call to action (DM, link in bio, or email), 5–12 relevant hashtags mixing Caribbean/local and niche tags.
- Slide text is short: headlines under 60 characters where possible. Carousels 4–8 slides with a final CTA slide.
- Reels: provide a script and use slides as storyboard frames (a video still has to be filmed/edited by the team).`;

/** Plan and produce next week's posts as drafts awaiting approval. Nothing is published here. */
export async function planWeek(orgId: string, opts: { trigger?: string; themes?: string } = {}) {
  const db = adminClient();
  const run = await startRun(orgId, "content_creator", { themes: opts.themes }, opts.trigger);
  if (!run) return { skipped: "agent disabled" };
  try {
    const { data: org } = await db.from("organizations").select("settings").eq("id", orgId).single();
    const settings = (org?.settings ?? {}) as OrgSettings;
    const count = Math.min(7, Math.max(1, settings.posts_per_week ?? 4));
    const [{ data: authorised }, { data: recent }, { data: account }] = await Promise.all([
      db.from("content_assets").select("id, spec, client_authorization_note").eq("organization_id", orgId).eq("is_client_work", true).limit(20),
      db.from("social_posts").select("caption").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(12),
      db.from("instagram_accounts").select("id").eq("organization_id", orgId).limit(1).maybeSingle(),
    ]);

    const { data: plan, usage } = await runStructured({
      system: SYSTEM,
      prompt: `Create ${count} posts for next week. Mix formats (at least one carousel and one educational post).
${opts.themes ? `Themes requested: ${opts.themes}` : ""}
Authorised client assets: ${authorised?.length ? JSON.stringify(authorised) : "NONE — do not use portfolio or before_after formats."}
Avoid repeating these recent captions: ${(recent ?? []).map((r) => r.caption.slice(0, 80)).join(" | ") || "(none)"}`,
      schema: Plan,
      resultDescription: "Submit the weekly content plan.",
      model: run.model,
      maxTokens: 12000,
    });

    const allowedAssets = new Set((authorised ?? []).map((a) => a.id));
    const { data: taken } = await db.from("social_posts").select("scheduled_for").eq("organization_id", orgId).not("scheduled_for", "is", null);
    const slots = nextSlots(count, new Date(), slotsForCount(count, settings.posting_slots), new Set((taken ?? []).map((t) => new Date(t.scheduled_for!).toISOString())));
    const provider = imageProvider();
    const created: string[] = [];

    for (const [i, p] of plan.posts.slice(0, count).entries()) {
      const usesClientWork = p.slides.some((s) => s.asset_ids?.length);
      if ((p.format === "before_after" || p.format === "portfolio" || usesClientWork) && !p.slides.every((s) => (s.asset_ids ?? []).every((id) => allowedAssets.has(id)))) {
        continue; // refuses unauthorised client work
      }
      const { data: idea } = await db.from("content_ideas").insert({
        organization_id: orgId, format: p.format, pillar: p.pillar, title: p.title, brief: p.brief, status: "in_production",
      }).select("id").single();

      const assetIds: string[] = [];
      for (const [n, s] of p.slides.entries()) {
        const imageUrls = await Promise.all((s.asset_ids ?? []).map(async (id) => {
          const { data: a } = await db.from("content_assets").select("storage_path").eq("id", id).single();
          const { data: signed } = await db.storage.from("content").createSignedUrl(a!.storage_path!, 3600);
          return signed!.signedUrl;
        }));
        const spec: SlideSpec = { ...s, imageUrls, slideNumber: n + 1, slideCount: p.slides.length > 1 ? p.slides.length : undefined };
        const img = await provider.renderSlide(spec);
        const path = `${orgId}/${idea!.id}/${n + 1}.jpg`;
        const { error: upErr } = await db.storage.from("content").upload(path, img.bytes, { contentType: img.mime, upsert: true });
        if (upErr) throw new Error(`storage upload: ${upErr.message}`);
        const { data: asset } = await db.from("content_assets").insert({
          organization_id: orgId, content_idea_id: idea!.id, kind: p.format === "reel" ? "storyboard_frame" : "image",
          storage_path: path, width: img.width, height: img.height, generator: img.generator, is_ai_generated: img.isAiGenerated, spec,
        }).select("id").single();
        assetIds.push(asset!.id);
      }

      const mediaType = p.format === "reel" ? "REELS" : assetIds.length > 1 ? "CAROUSEL" : "IMAGE";
      const { data: post } = await db.from("social_posts").insert({
        organization_id: orgId, instagram_account_id: account?.id ?? null, content_idea_id: idea!.id, media_type: mediaType,
        caption: p.caption, hashtags: p.hashtags, asset_ids: mediaType === "REELS" ? [] : assetIds, reel_script: p.reel_script,
        status: "draft", scheduled_for: slots[i]?.toISOString() ?? null,
      }).select("id").single();
      await db.from("content_ideas").update({ status: "ready" }).eq("id", idea!.id);
      // Reels need a real video asset uploaded by the team before approval is requested.
      if (mediaType !== "REELS") await requestPostApproval(orgId, post!.id, "agent:content_creator");
      created.push(post!.id);
    }

    const output = { created: created.length, postIds: created };
    await finishRun(run.runId, { output, usage });
    await logActivity(orgId, { type: "agent", id: "content_creator" }, "content.week_planned", { type: "agent_runs", id: run.runId }, output);
    return output;
  } catch (err) {
    await finishRun(run.runId, { error: (err as Error).message });
    throw err;
  }
}
