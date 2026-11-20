import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, freshDb } from "./harness";

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const MEMBER = "00000000-0000-0000-0000-0000000000b2";
let db: PGlite;
let org: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0]!;
}

async function setup() {
  db = await freshDb();
  await db.exec(`insert into auth.users (id) values ('${ADMIN}'), ('${MEMBER}')`);
  await actAs(db, ADMIN);
  org = (await one<{ id: string }>("select public.create_organization('WebCraft TT', 'webcraft') as id")).id;
  await actAs(db, null);
  await db.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [org, MEMBER]);
}

async function prospectWithContact(email: string) {
  const p = await one<{ id: string }>(
    "insert into prospects (organization_id, business_name, country_code, industry) values ($1, $2, 'TT', 'retail') returning id",
    [org, `Biz ${email}`],
  );
  const c = await one<{ id: string }>(
    "insert into contacts (organization_id, prospect_id, email, is_primary) values ($1, $2, $3, true) returning id",
    [org, p.id, email],
  );
  return { prospectId: p.id, contactId: c.id };
}

async function draftEmail(email: string, campaignId: string | null = null) {
  const { prospectId, contactId } = await prospectWithContact(email);
  const m = await one<{ id: string; content_hash: string }>(
    `insert into email_messages (organization_id, prospect_id, contact_id, campaign_id, direction, status, to_email, subject, body_text)
     values ($1, $2, $3, $4, 'outbound', 'draft', $5, 'Hello', 'A personalised note') returning id, content_hash`,
    [org, prospectId, contactId, campaignId, email],
  );
  return { ...m, prospectId, contactId };
}

async function requestMessageApproval(messageId: string, hash: string) {
  return (await one<{ id: string }>(
    `insert into approval_requests (organization_id, kind, title, target_type, target_id, content_hash, max_uses, requested_by)
     values ($1, 'email_message', 't', 'email_messages', $2, $3, 1, 'agent:sales_rep') returning id`,
    [org, messageId, hash],
  )).id;
}

const approve = async (id: string, as: string | null = ADMIN) => {
  await actAs(db, as);
  try {
    await db.query("update approval_requests set status = 'approved' where id = $1", [id]);
  } finally {
    await actAs(db, null);
  }
};
const consume = (approvalId: string, targetId: string, type = "email_messages") =>
  db.query("select public.consume_approval($1, $2, $3)", [approvalId, type, targetId]);

describe("approval enforcement", () => {
  beforeEach(setup, 60_000);

  it("agents (service role, no user) cannot approve their own requests", async () => {
    const m = await draftEmail("a@shop.tt");
    const id = await requestMessageApproval(m.id, m.content_hash);
    await expect(approve(id, null)).rejects.toThrow(/owner or admin/);
  });

  it("members cannot approve; admins can", async () => {
    const m = await draftEmail("a@shop.tt");
    const id = await requestMessageApproval(m.id, m.content_hash);
    await expect(approve(id, MEMBER)).rejects.toThrow(/owner or admin/);
    await approve(id, ADMIN);
    const row = await one<{ status: string; decided_by: string }>("select status, decided_by from approval_requests where id = $1", [id]);
    expect(row).toEqual({ status: "approved", decided_by: ADMIN });
  });

  it("approvals cannot be inserted pre-approved", async () => {
    await expect(db.query(
      "insert into approval_requests (organization_id, kind, status, title, scope, max_uses, requested_by) values ($1, 'email_campaign', 'approved', 't', '{}', 500, 'agent:sales_rep')",
      [org],
    )).rejects.toThrow(/created pending/);
  });

  it("approved scope is immutable (no silent widening)", async () => {
    const m = await draftEmail("a@shop.tt");
    const id = await requestMessageApproval(m.id, m.content_hash);
    await approve(id);
    await expect(db.query("update approval_requests set max_uses = 50 where id = $1", [id])).rejects.toThrow(/cannot be changed/);
    await expect(db.query("update approval_requests set expires_at = now() + interval '1 year' where id = $1", [id])).rejects.toThrow(/cannot be changed/);
    await expect(db.query("update approval_requests set used_count = 1 where id = $1", [id])).rejects.toThrow(/consume_approval/);
  });

  it("outbound email cannot be marked sending/sent without a consumed approval", async () => {
    const m = await draftEmail("a@shop.tt");
    await expect(db.query("update email_messages set status = 'sending' where id = $1", [m.id])).rejects.toThrow(/no consumed approval/);
    const id = await requestMessageApproval(m.id, m.content_hash);
    await db.query("update email_messages set approval_id = $1 where id = $2", [id, m.id]);
    await expect(db.query("update email_messages set status = 'sent' where id = $1", [m.id])).rejects.toThrow(/no consumed approval/);
  });

  it("pending (unapproved) approvals cannot be consumed", async () => {
    const m = await draftEmail("a@shop.tt");
    const id = await requestMessageApproval(m.id, m.content_hash);
    await expect(consume(id, m.id)).rejects.toThrow(/approval is pending/);
  });

  it("consumes a single-message approval once, idempotently, then exhausts", async () => {
    const m = await draftEmail("a@shop.tt");
    const id = await requestMessageApproval(m.id, m.content_hash);
    await approve(id);
    await consume(id, m.id);
    await consume(id, m.id); // retry of the same send: no error, no double count
    await db.query("update email_messages set status = 'sending', approval_id = $1 where id = $2", [id, m.id]);
    const a = await one<{ used_count: number; status: string }>("select used_count, status from approval_requests where id = $1", [id]);
    expect(a).toEqual({ used_count: 1, status: "exhausted" });
  });

  it("editing a message after approval voids the approval", async () => {
    const m = await draftEmail("a@shop.tt");
    const id = await requestMessageApproval(m.id, m.content_hash);
    await approve(id);
    await db.query("update email_messages set body_text = 'Something else entirely' where id = $1", [m.id]);
    await expect(consume(id, m.id)).rejects.toThrow(/changed after approval/);
  });

  it("an approval for one message cannot authorise a different message", async () => {
    const m1 = await draftEmail("a@shop.tt");
    const m2 = await draftEmail("b@shop.tt");
    const id = await requestMessageApproval(m1.id, m1.content_hash);
    await approve(id);
    await expect(consume(id, m2.id)).rejects.toThrow(/does not match/);
  });

  it("suppressed recipients and do-not-contact prospects are blocked at the database", async () => {
    const m = await draftEmail("a@shop.tt");
    const id = await requestMessageApproval(m.id, m.content_hash);
    await approve(id);
    await db.query("insert into suppression_list (organization_id, domain, reason) values ($1, 'shop.tt', 'opt_out')", [org]);
    await expect(consume(id, m.id)).rejects.toThrow(/suppressed/);

    const m2 = await draftEmail("owner@garage.tt");
    const id2 = await requestMessageApproval(m2.id, m2.content_hash);
    await approve(id2);
    await db.query("update prospects set status = 'do_not_contact' where id = $1", [m2.prospectId]);
    await expect(consume(id2, m2.id)).rejects.toThrow(/suppressed|do not contact/);
    const s = await one<{ n: number }>("select count(*)::int as n from suppression_list where email = 'owner@garage.tt'");
    expect(s.n).toBe(1); // DNC auto-suppresses the contact's email
  });

  it("campaign approvals enforce recipient list, total cap and daily cap", async () => {
    const camp = await one<{ id: string }>("insert into outreach_campaigns (organization_id, name) values ($1, 'Hardware Q1') returning id", [org]);
    const a = await draftEmail("one@hw.tt", camp.id);
    const b = await draftEmail("two@hw.tt", camp.id);
    const c = await draftEmail("three@hw.tt", camp.id);
    const outsider = await draftEmail("outsider@hw.tt", camp.id);
    const appr = await one<{ id: string }>(
      `insert into approval_requests (organization_id, kind, title, target_type, target_id, scope, max_uses, requested_by)
       values ($1, 'email_campaign', 'c', 'outreach_campaigns', $2, $3, 3, 'agent:sales_rep') returning id`,
      [org, camp.id, JSON.stringify({ campaign_id: camp.id, recipient_contact_ids: [a.contactId, b.contactId, c.contactId], daily_cap: 2 })],
    );
    await approve(appr.id);
    await expect(consume(appr.id, outsider.id)).rejects.toThrow(/not in the approved campaign recipient list/);
    await consume(appr.id, a.id);
    await consume(appr.id, b.id);
    await expect(consume(appr.id, c.id)).rejects.toThrow(/daily cap/);

    const notInCampaign = await draftEmail("x@hw.tt", null);
    await expect(consume(appr.id, notInCampaign.id)).rejects.toThrow(/not part of the approved campaign/);
  });

  it("expired approvals cannot be consumed", async () => {
    const m = await draftEmail("a@shop.tt");
    const id = await requestMessageApproval(m.id, m.content_hash);
    await db.query("update approval_requests set expires_at = now() + interval '1 second' where id = $1", [id]);
    await approve(id);
    await db.query("select pg_sleep(1.2)");
    await expect(consume(id, m.id)).rejects.toThrow(/expired/);
  });

  it("social posts need a consumed approval and an unchanged hash to publish", async () => {
    const post = await one<{ id: string; content_hash: string }>(
      "insert into social_posts (organization_id, media_type, caption) values ($1, 'IMAGE', 'Hello Trinidad') returning id, content_hash",
      [org],
    );
    await expect(db.query("update social_posts set status = 'publishing' where id = $1", [post.id])).rejects.toThrow(/no consumed approval/);
    const appr = await one<{ id: string }>(
      `insert into approval_requests (organization_id, kind, title, target_type, target_id, content_hash, max_uses, requested_by)
       values ($1, 'social_post', 'p', 'social_posts', $2, $3, 1, 'agent:content_creator') returning id`,
      [org, post.id, post.content_hash],
    );
    await approve(appr.id);
    await consume(appr.id, post.id, "social_posts");
    await db.query("update social_posts set status = 'publishing', approval_id = $1 where id = $2", [appr.id, post.id]);
  });

  it("publishing schedule enforces its post list and weekly cap", async () => {
    const mk = async (cap: string) => one<{ id: string; content_hash: string }>(
      "insert into social_posts (organization_id, media_type, caption) values ($1, 'IMAGE', $2) returning id, content_hash", [org, cap]);
    const p1 = await mk("one"); const p2 = await mk("two"); const p3 = await mk("three");
    const appr = await one<{ id: string }>(
      `insert into approval_requests (organization_id, kind, title, scope, max_uses, requested_by)
       values ($1, 'publishing_schedule', 's', $2, 2, 'user:x') returning id`,
      [org, JSON.stringify({ posts: [{ id: p1.id, hash: p1.content_hash }, { id: p2.id, hash: p2.content_hash }], max_per_week: 1 })],
    );
    await approve(appr.id);
    await expect(consume(appr.id, p3.id, "social_posts")).rejects.toThrow(/not in the approved schedule/);
    await consume(appr.id, p1.id, "social_posts");
    await expect(consume(appr.id, p2.id, "social_posts")).rejects.toThrow(/weekly publishing cap/);
  });
});

describe("jobs and audit", () => {
  beforeEach(setup, 60_000);

  it("claim_jobs only returns due jobs and never the same job twice", async () => {
    await db.query("insert into scheduled_jobs (organization_id, job_type, idempotency_key) values ($1, 'x', 'k1'), ($1, 'x', 'k2')", [org]);
    await db.query("insert into scheduled_jobs (organization_id, job_type, idempotency_key, run_at) values ($1, 'x', 'later', now() + interval '1 hour')", [org]);
    const first = await db.query<{ idempotency_key: string; attempts: number }>("select * from public.claim_jobs('w1', 10)");
    const second = await db.query("select * from public.claim_jobs('w2', 10)");
    expect(first.rows.map((r) => r.idempotency_key).sort()).toEqual(["k1", "k2"]);
    expect(first.rows.every((r) => r.attempts === 1)).toBe(true);
    expect(second.rows).toHaveLength(0);
  });

  it("idempotency keys prevent duplicate jobs", async () => {
    await db.query("insert into scheduled_jobs (organization_id, job_type, idempotency_key) values ($1, 'x', 'leads:2026-11-20')", [org]);
    await expect(db.query("insert into scheduled_jobs (organization_id, job_type, idempotency_key) values ($1, 'x', 'leads:2026-11-20')", [org])).rejects.toThrow(/duplicate/);
  });

  it("activity log records approval decisions and is append-only", async () => {
    const m = await draftEmail("a@shop.tt");
    const id = await requestMessageApproval(m.id, m.content_hash);
    await approve(id);
    const log = await one<{ actor_type: string; actor_id: string }>(
      "select actor_type, actor_id from activity_logs where entity_id = $1 and action = 'update' order by id desc limit 1", [id]);
    expect(log).toEqual({ actor_type: "user", actor_id: ADMIN });
    await expect(db.query("delete from activity_logs")).rejects.toThrow(/append-only/);
  });

  it("prospects are deduplicated by domain and by name+country", async () => {
    await db.query("insert into prospects (organization_id, business_name, country_code, website_domain) values ($1, 'Island Hardware Ltd', 'TT', 'islandhw.tt')", [org]);
    await expect(db.query("insert into prospects (organization_id, business_name, country_code, website_domain) values ($1, 'Island Hardware', 'TT', 'islandhw.tt')", [org])).rejects.toThrow(/duplicate/);
    await expect(db.query("insert into prospects (organization_id, business_name, country_code) values ($1, 'ISLAND hardware ltd.', 'TT')", [org])).rejects.toThrow(/duplicate/);
  });
});
