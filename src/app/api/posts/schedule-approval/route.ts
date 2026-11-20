import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { requestScheduleApproval } from "@/lib/approvals";

const Body = z.object({ postIds: z.array(z.string().uuid()).min(1).max(30), maxPerWeek: z.number().int().min(1).max(7) });

/** Bundle upcoming posts (as they are now) into one schedule approval for an owner/admin to review. */
export const POST = route(async (req: NextRequest) => {
  rejectInDemo();
  const b = Body.parse(await req.json());
  const { orgId, user, supabase } = await requireMembership("member");
  const { data: posts } = await supabase.from("social_posts").select("id, scheduled_for, media_type").in("id", b.postIds).eq("organization_id", orgId);
  const eligible = (posts ?? []).filter((p) => p.media_type !== "REELS"); // Reels need a filmed video first
  if (!eligible.length) return NextResponse.json({ error: "No eligible posts" }, { status: 422 });
  const last = Math.max(...eligible.map((p) => new Date(p.scheduled_for ?? Date.now()).getTime()));
  const id = await requestScheduleApproval(orgId, eligible.map((p) => p.id), b.maxPerWeek, `user:${user.id}`, new Date(last + 2 * 86400_000).toISOString());
  return NextResponse.json({ ok: true, approvalId: id });
});
