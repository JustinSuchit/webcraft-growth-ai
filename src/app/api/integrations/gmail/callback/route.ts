import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { verifyState } from "@/lib/oauth";
import { exchangeGmailCode } from "@/lib/integrations/mail/gmail";

export const GET = route(async (req: NextRequest) => {
  const { user, orgId } = await requireMembership("admin");
  const state = await verifyState(req.nextUrl.searchParams.get("state"), user.id);
  const code = req.nextUrl.searchParams.get("code");
  if (!state || state.o !== orgId || !code) return NextResponse.redirect(new URL("/settings?error=gmail_state", req.url));
  const { refreshToken, email, scopes } = await exchangeGmailCode(code);
  const { error } = await adminClient().rpc("store_integration_secret", {
    p_org: orgId, p_provider: "gmail", p_external_account_id: email, p_account_label: email,
    p_scopes: scopes, p_secret: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (error) throw new Error(error.message);
  return NextResponse.redirect(new URL("/settings?connected=gmail", req.url));
});
