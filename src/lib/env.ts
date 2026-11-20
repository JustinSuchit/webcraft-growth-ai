import "server-only";
import { z } from "zod";

/**
 * Environment is validated lazily so the app can boot in demo mode with nothing configured.
 * Each integration reports whether it is configured; nothing pretends to succeed when it isn't.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  ANTHROPIC_MODEL_FAST: z.string().default("claude-haiku-5-5"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(), // smtps://user:pass@host:465 — alternative to Gmail API
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_VERSION: z.string().default("v26.0"),
  IMAGE_PROVIDER: z.enum(["template", "openai"]).default("template"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  CRON_SECRET: z.string().min(16).optional(),
  STATE_SIGNING_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function integrationStatus() {
  const e = env();
  return {
    supabase: Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY && e.SUPABASE_SERVICE_ROLE_KEY),
    anthropic: Boolean(e.ANTHROPIC_API_KEY),
    gmail: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    smtp: Boolean(e.SMTP_URL),
    meta: Boolean(e.META_APP_ID && e.META_APP_SECRET),
    imageAi: e.IMAGE_PROVIDER === "openai" && Boolean(e.OPENAI_API_KEY),
    cron: Boolean(e.CRON_SECRET),
  };
}

/** Demo mode = no database. The UI shows sample data, clearly labelled, and every external action is disabled. */
export function isDemoMode(): boolean {
  return !integrationStatus().supabase;
}
