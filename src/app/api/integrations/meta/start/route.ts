import { NextResponse } from "next/server";
import { rejectInDemo, route } from "@/lib/api";
import { requireMembership } from "@/lib/supabase/server";
import { createState } from "@/lib/oauth";
import { metaAuthorizeUrl } from "@/lib/integrations/meta";

export const GET = route(async () => {
  rejectInDemo();
  const { orgId, user } = await requireMembership("admin");
  return NextResponse.redirect(metaAuthorizeUrl(await createState(orgId, user.id)));
});
