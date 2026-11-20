import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { RunUsage } from "@/lib/ai/claude";

type AgentKind = "lead_discovery" | "sales_rep" | "crm_manager" | "content_creator" | "growth_strategist";

export async function startRun(orgId: string, kind: AgentKind, input: Record<string, unknown>, trigger = "schedule") {
  const db = adminClient();
  const { data: agent } = await db.from("agents").select("id, enabled, model, config").eq("organization_id", orgId).eq("kind", kind).single();
  if (!agent) throw new Error(`agent ${kind} not configured for org`);
  if (!agent.enabled) return null;
  const { data: run } = await db
    .from("agent_runs")
    .insert({ organization_id: orgId, agent_id: agent.id, status: "running", trigger, input, started_at: new Date().toISOString() })
    .select("id")
    .single();
  return { runId: run!.id as string, model: agent.model as string, config: (agent.config ?? {}) as Record<string, unknown> };
}

export async function finishRun(runId: string, result: { output?: unknown; error?: string; usage?: Partial<RunUsage> }) {
  await adminClient()
    .from("agent_runs")
    .update({
      status: result.error ? "failed" : "succeeded",
      output: result.output ?? null,
      error: result.error ?? null,
      input_tokens: result.usage?.inputTokens ?? 0,
      output_tokens: result.usage?.outputTokens ?? 0,
      cost_usd: Number((result.usage?.costUsd ?? 0).toFixed(4)),
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export function addUsage(a: RunUsage, b: RunUsage): RunUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    webSearches: a.webSearches + b.webSearches,
    costUsd: a.costUsd + b.costUsd,
  };
}
export const ZERO_USAGE: RunUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0, costUsd: 0 };
