import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { enqueue } from "@/lib/jobs/queue";
import { runWorker } from "@/lib/jobs/worker";

const Body = z.object({
  decision: z.enum(["approved", "rejected", "revoked"]),
  note: z.string().max(500).optional(),
  expectedUpdatedAt: z.string(), // optimistic concurrency: refuse if the request changed while you were reviewing it
});

/**
 * The decision is written with the *user's* session, so RLS + the guard trigger verify the
 * caller is an owner/admin. The service role is only used afterwards to schedule the work.
 */
export const POST = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  rejectInDemo();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const { supabase, orgId } = await requireMembership("admin");

  const { data, error } = await supabase
    .from("approval_requests")
    .update({ status: body.decision, decision_note: body.note ?? null })
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("updated_at", body.expectedUpdatedAt)
    .select("id, kind, status, target_type, target_id, scope")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "This request changed or was already decided. Reload and review again." }, { status: 409 });

  const db = adminClient();
  if (data.status === "approved") {
    if (data.kind === "email_message") {
      await db.from("email_messages").update({ status: "approved" }).eq("id", data.target_id);
      await enqueue(orgId, "outreach.send", { messageId: data.target_id }, `send:${data.target_id}`);
    } else if (data.kind === "email_campaign") {
      await db.from("outreach_campaigns").update({ status: "active", starts_at: new Date().toISOString() }).eq("id", data.target_id);
      const contactIds = (data.scope as { recipient_contact_ids: string[] }).recipient_contact_ids;
      const { data: contacts } = await db.from("contacts").select("id, prospect_id").in("id", contactIds);
      for (const c of contacts ?? []) {
        await enqueue(orgId, "outreach.draft", { prospectId: c.prospect_id, campaignId: data.target_id }, `draft:${data.target_id}:${c.id}`);
      }
    } else if (data.kind === "social_post") {
      await db.from("social_posts").update({ status: "scheduled" }).eq("id", data.target_id);
    }
  } else if (data.status === "rejected") {
    if (data.target_type === "email_messages") await db.from("email_messages").update({ status: "cancelled" }).eq("id", data.target_id);
    if (data.target_type === "social_posts") await db.from("social_posts").update({ status: "draft" }).eq("id", data.target_id);
    if (data.target_type === "outreach_campaigns") await db.from("outreach_campaigns").update({ status: "draft" }).eq("id", data.target_id);
  }
  after(() => runWorker(`approval-${id}`, 25_000).catch(() => undefined));
  return NextResponse.json({ ok: true, status: data.status });
});
