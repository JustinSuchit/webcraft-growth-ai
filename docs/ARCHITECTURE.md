# Architecture

```
                 ┌────────────────────────── Vercel ──────────────────────────┐
 Browser ──────▶ │ Next.js App Router                                          │
 (owner/admin/   │  • 13 dashboard pages (Server Components, user-scoped        │
  member)        │    Supabase client → RLS)                                    │
                 │  • API routes: approvals, campaigns, OAuth, unsubscribe…     │
 Vercel Cron ──▶ │  • /api/cron/tick (5 min) · /api/cron/daily                  │
                 │       └─ scheduler → enqueue → worker (claim_jobs)           │
                 │             └─ handlers → agents & services (service role)   │
                 └───────┬──────────────┬───────────────┬──────────────┬───────┘
                         │              │               │              │
                 Supabase Postgres   Anthropic       Gmail API      Instagram Graph API
                 Auth · Storage ·    Messages API    (send, read    (containers, publish,
                 Vault · RLS ·       + web search    threads)       insights, business
                 triggers                                            discovery)
```

## The approval boundary (most important design decision)

Agents run server-side with the Supabase **service role**, which bypasses RLS — so permission checks in application code alone would be bypassable by a bug or a prompt-injected agent. Enforcement therefore lives in **Postgres triggers and a `SECURITY DEFINER` function**, which the service role cannot skip:

1. `approval_requests` can only be **inserted as `pending`**.
2. Only a request carrying a signed-in **owner/admin JWT** (`auth.uid()`) can set `approved`/`rejected`. The service role has no `auth.uid()`, so agents can never approve.
3. After a decision, **scope is immutable** (`scope`, `max_uses`, `expires_at`, `target_id`, `content_hash`). Widening = a new request.
4. `email_messages` and `social_posts` have a **`content_hash` generated column**. Single-item approvals store the hash; any edit voids them.
5. `consume_approval()` is the only gate to an external action. It row-locks the approval and checks status, expiry, `used_count < max_uses`, campaign recipient list, daily cap / weekly cap, schedule post list + hashes, suppression list and Do-Not-Contact — then records a usage (unique per target = idempotent retries).
6. A trigger refuses to move an email to `sending`/`sent` or a post to `publishing`/`published` unless a usage for that exact row exists.

All of this is covered by `tests/db/approvals.test.ts`, which runs the real migrations in PGlite.

## Agents

| Agent | Code | Model use | Writes |
|---|---|---|---|
| Lead Discovery | `src/lib/agents/lead-discovery.ts` | Claude + `web_search` tool, structured output via a `submit_result` tool validated with Zod | prospects, contacts, prospect_research, lead_scores |
| Sales Representative | `src/lib/agents/sales-rep.ts`, `src/lib/outreach/*` | drafting + reply classification | email_messages (drafts), approval_requests, threads |
| CRM Manager | `src/lib/agents/crm-manager.ts` | short summaries (Haiku) | lead_scores, tasks, notifications |
| Content Creator | `src/lib/agents/content-creator.ts` | weekly plan | content_ideas, content_assets, social_posts |
| Growth Strategist | `src/lib/agents/growth-strategist.ts` | web search + recommendations | instagram_prospects |

**Anti-fabrication:** every URL that `web_search` actually returned is collected. Evidence, contact-source and opportunity URLs are checked against that set. Prospects with no verified evidence are discarded. Emails are kept only when their source page was retrieved. Unverified claims are stored separately and reduce confidence. Agents may only state facts about WebCraft TT that are listed in `src/lib/agents/profile.ts`.

## Repository map

```
supabase/migrations/      5 SQL migrations: core, crm, outreach, social, security (RLS + guards)
src/app/(app)/            dashboard pages (Overview … Integrations & Settings)
src/app/api/              route handlers: cron, approvals, agents, campaigns, OAuth, unsubscribe, preview
src/app/login, onboarding auth + workspace bootstrap
src/proxy.ts              session refresh + auth gate (Next 16 "proxy", formerly middleware)
src/lib/agents/           the five agents + WebCraft fact profile
src/lib/ai/claude.ts      Claude wrapper: web search, structured output, cost tracking
src/lib/approvals.ts      request/consume approvals
src/lib/jobs/             queue, worker, handlers, scheduler, backoff
src/lib/outreach/         send (Gmail/SMTP) and reply sync
src/lib/social/           publish, metrics, schedule, captions
src/lib/integrations/     gmail, smtp, mime, meta, image adapters (template, openai)
src/lib/compliance/       robots.txt, site audit, outreach rules
src/lib/demo/             fictional demo dataset
tests/db/                 migrations, approval enforcement, RLS (PGlite)
tests/unit/               scoring, robots, compliance, signing, backoff, schedule, MIME
```

## Key trade-offs

- **Messages API tool loop instead of the Claude Agent SDK.** The Agent SDK runs a long-lived agent process with a filesystem — great for coding agents, awkward on 60-second serverless functions. Each agent here is a bounded, single-purpose task, so a typed tool loop (`runStructured`) with server-side web search is simpler, cheaper and easier to audit. If a task later needs long multi-hour autonomy, move that agent to a worker host and the Agent SDK.
- **Postgres job queue instead of Inngest/Trigger.dev.** One less vendor and the queue sits next to the data it guards (approvals, idempotency keys in the same transaction space). Cost: no step-function UI; throughput is ample for tens of jobs per day. The handler interface is small, so swapping to Inngest later is straightforward.
- **Brand-template graphics by default instead of AI images.** Instagram posts are mostly text; AI image models garble text and add cost. Templates render deterministic 1080×1350 JPEGs with bundled Geist fonts. An OpenAI adapter is included for illustrative imagery; posts using it are published with Instagram's `is_ai_generated` label.
- **No Python service.** All research runs through Claude's web search plus one robots.txt-aware homepage fetch in TypeScript, so a second runtime adds no capability. A Python pipeline would make sense for bulk registry imports (e.g. a licensed company-registry dataset) — not needed for 10 prospects a day.
- **Polling Gmail every 15 minutes instead of Pub/Sub push.** Push needs a Google Cloud Pub/Sub topic and watch renewal; polling ~100 active threads is well within quota and simpler. Upgrade path: `users.watch` + a webhook route.
- **Facebook Login variant of the Instagram API.** Required for Business Discovery (account research) and aggregated insights; it needs the IG account linked to a Facebook Page.
