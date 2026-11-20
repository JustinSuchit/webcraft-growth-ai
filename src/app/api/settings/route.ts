import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";

const Body = z.object({
  settings: z.object({
    daily_prospect_target: z.number().int().min(1).max(25),
    posts_per_week: z.number().int().min(1).max(7),
    daily_email_cap: z.number().int().min(1).max(150),
  }),
  sender_identity: z.object({
    legalName: z.string().max(120), senderName: z.string().max(120), postalAddress: z.string().max(300),
    website: z.string().max(200), replyTo: z.string().email().or(z.literal("")),
  }),
});

export const PATCH = route(async (req: NextRequest) => {
  rejectInDemo();
  const b = Body.parse(await req.json());
  const { supabase, orgId } = await requireMembership("admin");
  const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
  const { error } = await supabase.from("organizations").update({
    settings: { ...(org?.settings ?? {}), ...b.settings },
    sender_identity: b.sender_identity,
  }).eq("id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
