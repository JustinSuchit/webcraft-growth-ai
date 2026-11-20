import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { PROSPECT_STATUSES } from "@/lib/db/types";

const Body = z.object({
  status: z.enum(PROSPECT_STATUSES.map((s) => s.value) as [string, ...string[]]).optional(),
  note: z.string().max(2000).optional(),
  next_follow_up_at: z.string().datetime().nullable().optional(),
});

export const PATCH = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  rejectInDemo();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const { supabase, orgId, user } = await requireMembership("member");
  const { data: current } = await supabase.from("prospects").select("notes").eq("id", id).single();
  const notes = body.note ? `${current?.notes ? current.notes + "\n" : ""}[${new Date().toISOString().slice(0, 10)} ${user.email}] ${body.note}` : undefined;
  const { error } = await supabase.from("prospects").update({
    ...(body.status ? { status: body.status } : {}),
    ...(notes ? { notes } : {}),
    ...(body.next_follow_up_at !== undefined ? { next_follow_up_at: body.next_follow_up_at } : {}),
  }).eq("id", id).eq("organization_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
