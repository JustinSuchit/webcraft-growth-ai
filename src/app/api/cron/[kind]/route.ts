import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env, isDemoMode } from "@/lib/env";
import { route } from "@/lib/api";
import { scheduleDaily, scheduleTick } from "@/lib/jobs/scheduler";
import { runWorker } from "@/lib/jobs/worker";

export const maxDuration = 60;

/** Vercel Cron entrypoint. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export const GET = route(async (req: NextRequest, { params }: { params: Promise<{ kind: string }> }) => {
  const secret = env().CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isDemoMode()) return NextResponse.json({ skipped: "demo mode" });
  const { kind } = await params;
  if (kind === "daily") await scheduleDaily();
  else if (kind === "tick") await scheduleTick();
  else return NextResponse.json({ error: "unknown" }, { status: 404 });
  const summary = await runWorker(`vercel-${kind}-${Date.now()}`, 50_000);
  return NextResponse.json({ ok: true, kind, ...summary });
});
