import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { verifyState } from "@/lib/oauth";
import { exchangeMetaCode, META_SCOPES } from "@/lib/integrations/meta";

export const GET = route(async (req: NextRequest) => {
  const { user, orgId } = await requireMembership("admin");
  const state = await verifyState(req.nextUrl.searchParams.get("state"), user.id);
  const code = req.nextUrl.searchParams.get("code");
  if (!state || state.o !== orgId || !code) return NextResponse.redirect(new URL("/settings?error=meta_state", req.url));
  const accounts = await exchangeMetaCode(code);
  if (!accounts.length) return NextResponse.redirect(new URL("/settings?error=no_instagram_business_account", req.url));
  const db = adminClient();
  for (const a of accounts) {
    const { data: credId, error } = await db.rpc("store_integration_secret", {
      p_org: orgId, p_provider: "meta_instagram", p_external_account_id: a.igUserId, p_account_label: `@${a.username}`,
      p_scopes: META_SCOPES, p_secret: JSON.stringify({ page_token: a.pageToken, page_id: a.pageId }),
    });
    if (error) throw new Error(error.message);
    await db.from("instagram_accounts").upsert({
      organization_id: orgId, ig_user_id: a.igUserId, username: a.username, page_id: a.pageId, credential_id: credId,
      followers_count: a.followers, media_count: a.mediaCount,
    }, { onConflict: "organization_id,ig_user_id" });
  }
  await db.from("social_posts").update({ instagram_account_id: (await db.from("instagram_accounts").select("id").eq("organization_id", orgId).limit(1).single()).data?.id })
    .eq("organization_id", orgId).is("instagram_account_id", null);
  return NextResponse.redirect(new URL("/settings?connected=instagram", req.url));
});
