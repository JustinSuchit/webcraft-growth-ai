import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * Runs the real migrations in an in-process Postgres (PGlite) with minimal stand-ins for the
 * Supabase-provided schemas (auth, vault, storage) and roles. Lets us test RLS-independent
 * database logic — approval guards, consume_approval, send guards, job claiming — for real.
 */
const SUPABASE_STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text, description text, secret text);
create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$
  insert into vault.secrets (secret, name, description) values (s, n, d) returning id $$;
create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set secret = s where id = i $$;
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n, '/') $$;
`;

export async function freshDb() {
  const db = new PGlite({ extensions: { citext, pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(dir, f), "utf8").replace(/create extension if not exists supabase_vault[^;]*;/i, "");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`${f}: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Act as a signed-in user (sets the JWT sub that auth.uid() reads), or as the service role (null). */
export async function actAs(db: PGlite, userId: string | null) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false)`);
}
