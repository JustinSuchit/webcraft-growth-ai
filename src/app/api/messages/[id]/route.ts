import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { requestEmailApproval } from "@/lib/approvals";
import { checkDraft } from "@/lib/compliance/outreach-rules";

const Body = z.object({ subject: z.string().min(3).max(120), body_text: z.string().min(20).max(5000) });

/** Editing a draft withdraws its pending approval and requests a new one for the new content. */
export const PATCH = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  rejectInDemo();
  const { id } = await params;
  const b = Body.parse(await req.json());
  const { supabase, orgId, user } = await requireMembership("member");
  const { data: msg } = await supabase.from("email_messages").select("id, status, approval_id, in_reply_to").eq("id", id).eq("organization_id", orgId).single();
  if (!msg || !["draft", "awaiting_approval", "approved"].includes(msg.status)) return NextResponse.json({ error: "Only unsent drafts can be edited" }, { status: 409 });
  const issues = checkDraft({ subject: b.subject, bodyText: b.body_text }, !msg.in_reply_to);
  if (issues.length) return NextResponse.json({ error: `Compliance: ${issues.join("; ")}` }, { status: 422 });
  if (msg.approval_id) await supabase.from("approval_requests").update({ status: "revoked", decision_note: "draft edited" }).eq("id", msg.approval_id).eq("status", "pending");
  const { error } = await supabase.from("email_messages").update({ subject: b.subject, body_text: b.body_text, status: "draft", approval_id: null, ai_generated: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await requestEmailApproval(orgId, id, `user:${user.id}`);
  return NextResponse.json({ ok: true });
});
