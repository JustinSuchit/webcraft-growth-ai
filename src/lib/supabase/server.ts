import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/** User-scoped client: every query runs under the signed-in user's JWT, so RLS applies. */
export async function createUserClient() {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("Supabase is not configured");
  const store = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => {
        try {
          all.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}

export async function requireUser() {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
  return { supabase, user: data.user };
}

/** Resolve the caller's organization and role. Single-org product, but the schema is multi-tenant. */
export async function requireMembership(minRole: "viewer" | "member" | "admin" | "owner" = "viewer") {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (error || !data) throw new Response("No organization", { status: 403 });
  const rank = { viewer: 0, member: 1, admin: 2, owner: 3 } as const;
  if (rank[data.role as keyof typeof rank] < rank[minRole]) throw new Response("Forbidden", { status: 403 });
  return { supabase, user, orgId: data.organization_id as string, role: data.role as keyof typeof rank };
}
