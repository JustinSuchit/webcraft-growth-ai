import "server-only";
import { env } from "@/lib/env";
import { IntegrationError } from "../errors";
import { buildMime, toBase64Url, type OutgoingMail } from "./mime";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly", // reply monitoring
  "openid",
  "email",
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailAuthorizeUrl(state: string) {
  const e = env();
  const p = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: `${e.APP_URL}/api/integrations/gmail/callback`,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeGmailCode(code: string) {
  const e = env();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: e.GOOGLE_CLIENT_ID ?? "",
      client_secret: e.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${e.APP_URL}/api/integrations/gmail/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const tok = (await res.json()) as { access_token: string; refresh_token?: string; scope: string };
  if (!tok.refresh_token) throw new Error("Google did not return a refresh token; revoke access and reconnect");
  const profile = await gmailFetch<{ emailAddress: string }>(tok.access_token, "/profile");
  return { refreshToken: tok.refresh_token, email: profile.emailAddress, scopes: tok.scope.split(" ") };
}

export async function gmailAccessToken(refreshToken: string): Promise<string> {
  const e = env();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: e.GOOGLE_CLIENT_ID ?? "",
      client_secret: e.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new IntegrationError("gmail", `token refresh failed (${res.status})`, res.status === 400 || res.status === 401);
  return ((await res.json()) as { access_token: string }).access_token;
}


async function gmailFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 429 || res.status >= 500) {
    throw new IntegrationError("gmail", `HTTP ${res.status}`, false, Number(res.headers.get("retry-after")) || undefined);
  }
  if (!res.ok) throw new IntegrationError("gmail", `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, true);
  return (await res.json()) as T;
}

export async function gmailSend(token: string, mail: OutgoingMail, threadId?: string) {
  return gmailFetch<{ id: string; threadId: string }>(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: toBase64Url(buildMime(mail)), ...(threadId ? { threadId } : {}) }),
  });
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  snippet: string;
  labelIds?: string[];
  payload: { headers: { name: string; value: string }[]; mimeType: string; body?: { data?: string }; parts?: GmailMessage["payload"][] };
}

export async function gmailThread(token: string, threadId: string) {
  const t = await gmailFetch<{ messages: GmailMessage[] }>(token, `/threads/${threadId}?format=full`);
  return t.messages.map((m) => {
    const h = (n: string) => m.payload.headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    return {
      id: m.id,
      threadId: m.threadId,
      from: h("from"),
      to: h("to"),
      subject: h("subject"),
      messageId: h("message-id"),
      inReplyTo: h("in-reply-to"),
      date: new Date(Number(m.internalDate)),
      text: extractText(m.payload) || m.snippet,
      isSent: m.labelIds?.includes("SENT") ?? false,
    };
  });
}

function extractText(p: GmailMessage["payload"]): string {
  if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const part of p.parts ?? []) {
    const t = extractText(part);
    if (t) return t;
  }
  return "";
}

export { IntegrationError };
