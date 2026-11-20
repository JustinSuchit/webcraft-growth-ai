import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { requestCampaignApproval } from "@/lib/approvals";
import { INDUSTRIES, SERVICES } from "@/lib/db/types";

const Body = z.object({
  name: z.string().min(3).max(120),
  services: z.array(z.enum(SERVICES)).default([]),
  industry: z.enum(INDUSTRIES).optional(),
  country: z.string().length(2).optional(),
  minScore: z.number().int().min(0).max(100).default(60),
  dailyCap: z.number().int().min(1).max(50),
  totalCap: z.number().int().min(1).max(200),
  days: z.number().int().min(1).max(60).default(14),
});

/** Snapshot an explicit recipient list now; the approval is bound to exactly these contacts. */
export const POST = route(async (req: NextRequest) => {
  rejectInDemo();
  const b = Body.parse(await req.json());
  const { supabase, orgId, user } = await requireMembership("member");

  let q = supabase.from("prospects").select("id, contacts!inner(id, email, is_primary)")
    .eq("organization_id", orgId).in("status", ["researched", "qualified"]).gte("current_score", b.minScore)
    .eq("contacts.is_primary", true).not("contacts.email", "is", null)
    .order("current_score", { ascending: false }).limit(b.totalCap * 2);
  if (b.industry) q = q.eq("industry", b.industry);
  if (b.country) q = q.eq("country_code", b.country);
  const { data: prospects, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const admin = adminClient();
  const recipients: string[] = [];
  for (const p of prospects ?? []) {
    const c = (p.contacts as { id: string; email: string }[])[0];
    if (!c) continue;
    const { data: suppressed } = await admin.rpc("is_suppressed", { p_org: orgId, p_email: c.email });
    const { count } = await admin.from("email_messages").select("id", { count: "exact", head: true }).eq("contact_id", c.id).eq("direction", "outbound").neq("status", "cancelled");
    if (!suppressed && !count) recipients.push(c.id);
    if (recipients.length >= b.totalCap) break;
  }
  if (!recipients.length) return NextResponse.json({ error: "No eligible prospects (qualified, verified email, not suppressed, not yet contacted) match these filters." }, { status: 422 });

  const endsAt = new Date(Date.now() + b.days * 86400_000).toISOString();
  const { data: campaign, error: cErr } = await supabase.from("outreach_campaigns").insert({
    organization_id: orgId, name: b.name, services: b.services, daily_cap: b.dailyCap, total_cap: b.totalCap,
    target_criteria: { industry: b.industry, country: b.country, minScore: b.minScore }, ends_at: endsAt, created_by: `user:${user.id}`,
  }).select("id").single();
  if (cErr || !campaign) return NextResponse.json({ error: cErr?.message }, { status: 400 });

  await requestCampaignApproval(orgId, { id: campaign.id, name: b.name, dailyCap: b.dailyCap, totalCap: b.totalCap, endsAt }, recipients, `user:${user.id}`);
  return NextResponse.json({ ok: true, campaignId: campaign.id, recipients: recipients.length });
});
