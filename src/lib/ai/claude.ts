import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";

let client: Anthropic | undefined;
export function anthropic(): Anthropic {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
  client ??= new Anthropic({ apiKey: key, maxRetries: 3 });
  return client;
}

/**
 * Per-million-token USD estimates used only for the cost dashboard.
 * Verify against https://docs.claude.com pricing and override via agent config if they change.
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 3, output: 15 },
  "claude-haiku-5-5": { input: 1, output: 5 },
};
export const WEB_SEARCH_USD_PER_CALL = 0.01;

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  costUsd: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: RunUsage;
  /** Every URL actually returned by web_search during this run — used to verify evidence. */
  retrievedUrls: Set<string>;
}

interface StructuredOptions<S extends z.ZodTypeAny> {
  system: string;
  prompt: string;
  schema: S;
  resultDescription: string;
  model?: string;
  maxTokens?: number;
  webSearch?: { maxUses: number; blockedDomains?: string[] };
}

/**
 * Run Claude with optional server-side web search and force the final answer through a
 * typed `submit_result` tool, validated with Zod. Throws on invalid output rather than
 * guessing — callers record the failure on the agent run.
 */
export async function runStructured<S extends z.ZodTypeAny>(opts: StructuredOptions<S>): Promise<StructuredResult<z.infer<S>>> {
  const model = opts.model ?? env().ANTHROPIC_MODEL;
  const inputSchema = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Anthropic.Tool.InputSchema;
  const tools: Anthropic.ToolUnion[] = [
    { name: "submit_result", description: opts.resultDescription, input_schema: inputSchema },
  ];
  if (opts.webSearch) {
    tools.push({
      type: "web_search_20260318",
      name: "web_search",
      max_uses: opts.webSearch.maxUses,
      ...(opts.webSearch.blockedDomains?.length ? { blocked_domains: opts.webSearch.blockedDomains } : {}),
    });
  }

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];
  const usage: RunUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0, costUsd: 0 };
  const retrievedUrls = new Set<string>();

  for (let turn = 0; turn < 6; turn++) {
    const res = await anthropic().messages.create({
      model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      tools,
      messages,
    });
    usage.inputTokens += res.usage.input_tokens;
    usage.outputTokens += res.usage.output_tokens;
    usage.webSearches += res.usage.server_tool_use?.web_search_requests ?? 0;

    for (const block of res.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result") retrievedUrls.add(normalizeUrl(r.url));
      }
      if (block.type === "text" && block.citations) {
        for (const c of block.citations) if ("url" in c && c.url) retrievedUrls.add(normalizeUrl(c.url));
      }
    }

    const submit = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_result",
    );
    if (submit) {
      const parsed = opts.schema.safeParse(submit.input);
      if (!parsed.success) {
        // One repair attempt with the validation errors.
        messages.push({ role: "assistant", content: res.content });
        messages.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: submit.id,
            is_error: true,
            content: `Invalid result: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Call submit_result again with corrected data.`,
          }],
        });
        continue;
      }
      usage.costUsd = estimateCost(model, usage);
      return { data: parsed.data, usage, retrievedUrls };
    }

    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "pause_turn") continue; // server tool still working; resume
    messages.push({ role: "user", content: "Now call submit_result with your final, evidence-backed answer." });
  }
  throw new Error("Claude did not return a valid structured result");
}

/** Plain completion for short drafting/classification tasks. */
export async function complete(system: string, prompt: string, model = env().ANTHROPIC_MODEL_FAST, maxTokens = 1500) {
  const res = await anthropic().messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  const usage: RunUsage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, webSearches: 0, costUsd: 0 };
  usage.costUsd = estimateCost(model, usage);
  return { text, usage };
}

export function estimateCost(model: string, u: Pick<RunUsage, "inputTokens" | "outputTokens" | "webSearches">) {
  const p = PRICING[model] ?? PRICING["claude-sonnet-5-5"]!;
  return (u.inputTokens * p.input + u.outputTokens * p.output) / 1_000_000 + u.webSearches * WEB_SEARCH_USD_PER_CALL;
}

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    return `${u.protocol}//${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}
