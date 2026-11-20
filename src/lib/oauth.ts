import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { signToken, verifyToken } from "@/lib/signing";

const COOKIE = "wc_oauth_nonce";

/** OAuth `state` = signed {org, user, nonce}; nonce also set as an httpOnly cookie (CSRF protection). */
export async function createState(orgId: string, userId: string) {
  const secret = env().STATE_SIGNING_SECRET;
  if (!secret) throw new Error("STATE_SIGNING_SECRET is not configured");
  const nonce = randomBytes(16).toString("base64url");
  (await cookies()).set(COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/integrations" });
  return signToken({ o: orgId, u: userId, n: nonce }, secret, 600);
}

export async function verifyState(state: string | null, userId: string) {
  const secret = env().STATE_SIGNING_SECRET;
  if (!state || !secret) return null;
  const data = verifyToken<{ o: string; u: string; n: string }>(state, secret);
  const store = await cookies();
  const nonce = store.get(COOKIE)?.value;
  store.delete(COOKIE);
  if (!data || data.u !== userId || !nonce || nonce !== data.n) return null;
  return data;
}
