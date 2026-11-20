import { describe, expect, it } from "vitest";
import { freshDb } from "./harness";

describe("migrations", () => {
  it("apply cleanly and create every required table", async () => {
    const db = await freshDb();
    const { rows } = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    const names = rows.map((r) => r.table_name);
    for (const t of [
      "organizations", "agents", "agent_runs", "scheduled_jobs", "prospects", "contacts", "prospect_research",
      "lead_scores", "outreach_campaigns", "email_messages", "email_threads", "follow_up_tasks", "opportunities",
      "approval_requests", "suppression_list", "instagram_accounts", "instagram_prospects", "content_ideas",
      "content_assets", "social_posts", "publishing_jobs", "social_metrics", "notifications", "activity_logs",
      "integration_credentials_metadata",
    ]) expect(names).toContain(t);
  }, 60_000);
});
