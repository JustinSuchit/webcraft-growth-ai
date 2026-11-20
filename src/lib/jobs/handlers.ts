import "server-only";
import { runLeadDiscovery } from "@/lib/agents/lead-discovery";
import { draftOutreach } from "@/lib/agents/sales-rep";
import { dailySummary } from "@/lib/agents/crm-manager";
import { planWeek } from "@/lib/agents/content-creator";
import { researchAudience } from "@/lib/agents/growth-strategist";
import { sendApprovedEmail } from "@/lib/outreach/send";
import { syncReplies } from "@/lib/outreach/replies";
import { publishPost } from "@/lib/social/publish";
import { syncMetrics } from "@/lib/social/metrics";
import type { JobType } from "./queue";

type Handler = (orgId: string, payload: Record<string, unknown>) => Promise<unknown>;

export const handlers: Record<JobType, Handler> = {
  "lead_discovery.run": (org, p) => runLeadDiscovery(org, { target: p.target as number | undefined, trigger: (p.trigger as string) ?? "schedule" }),
  "crm.daily_summary": (org) => dailySummary(org),
  "outreach.draft": (org, p) => draftOutreach(org, p.prospectId as string, { campaignId: p.campaignId as string | undefined }),
  "outreach.send": (org, p) => sendApprovedEmail(org, p.messageId as string),
  "outreach.sync_replies": (org) => syncReplies(org),
  "content.plan_week": (org, p) => planWeek(org, { themes: p.themes as string | undefined }),
  "social.publish": (org, p) => publishPost(org, p.postId as string),
  "social.sync_metrics": (org) => syncMetrics(org),
  "growth.research": (org, p) => researchAudience(org, { focus: p.focus as string | undefined }),
};
