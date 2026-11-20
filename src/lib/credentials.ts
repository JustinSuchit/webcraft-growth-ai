import "server-only";
import { adminClient } from "@/lib/supabase/admin";

type Provider = "gmail" | "smtp" | "meta_instagram" | "image_openai" | "anthropic";

/** Fetch an org's credential: metadata from the table, secret from Supabase Vault via a service-role-only RPC. */
export async function getCredential(orgId: string, provider: Provider) {
  const db = adminClient();
  const { data: meta } = await db
    .from("integration_credentials_metadata")
    .select("id, account_label, external_account_id, scopes, status")
    .eq("organization_id", orgId)
    .eq("provider", provider)
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!meta) return null;
  const { data: secret, error } = await db.rpc("get_integration_secret", { p_credential_id: meta.id });
  if (error || !secret) return null;
  return { ...meta, secret: secret as string };
}

export async function markCredentialError(credentialId: string, status: "expired" | "revoked" | "error") {
  await adminClient().from("integration_credentials_metadata").update({ status }).eq("id", credentialId);
}
