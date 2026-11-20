import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { enqueue } from "@/lib/jobs/queue";
import { runWorker } from "@/lib/jobs/worker";

export const maxDuration = 60;

export const POST = route(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  rejectInDemo();
  const { id } = await params;
  const { orgId, supabase } = await requireMembership("member");
  const { data: p } = await supabase.from("prospects").select("id").eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  await enqueue(orgId, "outreach.draft", { prospectId: id }, `draft:manual:${id}:${Math.floor(Date.now() / 60_000)}`, new Date(), 2);
  after(() => runWorker(`draft-${id}`, 55_000).catch(() => undefined));
  return NextResponse.json({ ok: true });
});
