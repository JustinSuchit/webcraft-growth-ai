import { NextResponse, type NextRequest } from "next/server";
import { env, isDemoMode } from "@/lib/env";
import { verifyToken } from "@/lib/signing";
import { adminClient, logActivity } from "@/lib/supabase/admin";

async function suppress(token: string | null) {
  const secret = env().STATE_SIGNING_SECRET;
  if (!token || !secret || isDemoMode()) return false;
  const data = verifyToken<{ o: string; e: string }>(token, secret);
  if (!data) return false;
  await adminClient().from("suppression_list").upsert(
    { organization_id: data.o, email: data.e, reason: "opt_out", source: "unsubscribe_link" },
    { onConflict: "organization_id,email", ignoreDuplicates: true },
  );
  await adminClient().from("prospects").update({ status: "do_not_contact" }).eq("organization_id", data.o).eq("public_email", data.e);
  await logActivity(data.o, { type: "system" }, "unsubscribe", { type: "suppression_list" }, { via: "link" });
  return true;
}

const page = (ok: boolean) => new NextResponse(
  `<!doctype html><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><body style="font-family:system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem;line-height:1.5">${
    ok ? "<h1>You're unsubscribed</h1><p>WebCraft TT won't email you again. Sorry for the bother.</p>" : "<h1>Link not valid</h1><p>Reply to the email with “unsubscribe” and we'll remove you right away.</p>"
  }</body>`,
  { headers: { "content-type": "text/html; charset=utf-8" } },
);

/** GET from the footer link; POST is RFC 8058 one-click (List-Unsubscribe-Post). Both suppress immediately. */
export async function GET(req: NextRequest) {
  return page(await suppress(req.nextUrl.searchParams.get("t")));
}
export async function POST(req: NextRequest) {
  const ok = await suppress(req.nextUrl.searchParams.get("t"));
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
