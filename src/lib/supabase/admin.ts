import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let admin: SupabaseClient | undefined;

/**
 * Service-role client for agents and background jobs. It bypasses RLS but NOT database
 * triggers — approval enforcement lives in triggers and consume_approval(), so agents using
 * this client still cannot send or publish without a human-granted approval.
 */
export function adminClient(): SupabaseClient {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase service role is not configured");
  admin ??= createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export async function logActivity(
  orgId: string,
  actor: { type: "user" | "agent" | "system"; id?: string },
  action: string,
  entity: { type: string; id?: string },
  details: Record<string, unknown> = {},
) {
  await adminClient().from("activity_logs").insert({
    organization_id: orgId,
    actor_type: actor.type,
    actor_id: actor.id ?? null,
    action,
    entity_type: entity.type,
    entity_id: entity.id ?? null,
    details,
  });
}
