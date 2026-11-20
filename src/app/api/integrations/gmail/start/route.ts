import { NextResponse } from "next/server";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { createState } from "@/lib/oauth";
import { gmailAuthorizeUrl } from "@/lib/integrations/mail/gmail";

export const GET = route(async () => {
  rejectInDemo();
  const { orgId, user } = await requireMembership("admin");
  return NextResponse.redirect(gmailAuthorizeUrl(await createState(orgId, user.id)));
});
