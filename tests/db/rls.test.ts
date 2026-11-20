import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-0000000000a1";
const MEMBER = "00000000-0000-0000-0000-0000000000b2";
const OUTSIDER = "00000000-0000-0000-0000-0000000000c3";
let db: PGlite;
let org: string;

/** Run a query as the `authenticated` role with a given user, exactly like PostgREST does. */
async function asUser<T>(user: string, sql: string, params: unknown[] = []) {
  await actAs(db, user);
  await db.exec("set role authenticated");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
    await actAs(db, null);
  }
}

describe("row level security", () => {
  beforeAll(async () => {
    db = await freshDb();
    // Supabase grants table privileges to `authenticated`; RLS then decides row access.
    await db.exec(`grant usage on schema public, auth to authenticated;
      grant all on all tables in schema public to authenticated;
      grant execute on function auth.uid() to authenticated;`);
    await db.exec(`insert into auth.users (id) values ('${OWNER}'), ('${MEMBER}'), ('${OUTSIDER}')`);
    await actAs(db, OWNER);
    org = (await db.query<{ id: string }>("select public.create_organization('WebCraft TT', 'webcraft') as id")).rows[0]!.id;
    await actAs(db, null);
    await db.query("insert into organization_members values ($1, $2, 'member')", [org, MEMBER]);
    await db.query("insert into prospects (organization_id, business_name, country_code) values ($1, 'Island Hardware', 'TT')", [org]);
    await db.query("select public.store_integration_secret($1, 'gmail', 'sales@webcraft.tt', 'sales@webcraft.tt', '{}', 'refresh-token-secret')", [org]);
  }, 60_000);

  it("members see their org's prospects; outsiders see nothing", async () => {
    expect(await asUser(MEMBER, "select business_name from prospects")).toHaveLength(1);
    expect(await asUser(OUTSIDER, "select business_name from prospects")).toHaveLength(0);
  });

  it("outsiders cannot insert into another org", async () => {
    await expect(asUser(OUTSIDER, "insert into prospects (organization_id, business_name, country_code) values ($1, 'X', 'TT')", [org])).rejects.toThrow(/row-level security/);
  });

  it("credential metadata is admin-only and secrets are never readable by users", async () => {
    expect(await asUser(MEMBER, "select id from integration_credentials_metadata")).toHaveLength(0);
    expect(await asUser(OWNER, "select account_label from integration_credentials_metadata")).toHaveLength(1);
    await expect(asUser(OWNER, "select public.get_integration_secret(id) from integration_credentials_metadata")).rejects.toThrow(/permission denied/);
  });

  it("users cannot call consume_approval or claim_jobs directly", async () => {
    await expect(asUser(OWNER, "select public.consume_approval(gen_random_uuid(), 'email_messages', gen_random_uuid())")).rejects.toThrow(/permission denied/);
    await expect(asUser(OWNER, "select * from public.claim_jobs('x', 1)")).rejects.toThrow(/permission denied/);
  });

  it("activity logs are read-only to users", async () => {
    await expect(asUser(OWNER, "insert into activity_logs (organization_id, actor_type, action, entity_type) values ($1, 'user', 'fake', 'x')", [org])).rejects.toThrow(/row-level security/);
  });
});
