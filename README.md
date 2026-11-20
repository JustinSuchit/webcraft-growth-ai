# WebCraft Growth AI

A private sales and Instagram growth workspace for **WebCraft TT**. Five Claude-powered agents find and research Caribbean businesses, draft personalised outreach, run the CRM, produce branded Instagram content, and research audience-growth opportunities. **Nothing leaves the building without a human approval that the database itself enforces.**

```
Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, Vault, RLS)
Anthropic Claude (Messages API + server-side web search) · Gmail API / SMTP · Instagram Graph API v26 · Vercel
```

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000 — runs in DEMO MODE with no configuration
npm test               # 45 tests: approval enforcement, RLS, compliance, scheduling, MIME…
npm run build
```

Demo mode shows clearly labelled, fictional sample data (`.example` domains) and disables every external action — it never fakes a success. The brand graphic renderer works fully in demo mode. To go live, follow **[docs/SETUP.md](docs/SETUP.md)**.

## What's built — and what needs your credentials

| Area | Status | Needs |
|---|---|---|
| Supabase schema: 25 required tables + memberships + approval usages, FKs, indexes, unique/dedup constraints, RLS on every table, audit triggers, Vault-backed secrets | ✅ Built & tested (migrations run in tests) | A Supabase project |
| Approval engine: human-only decisions, immutable scope, content-hash binding, recipient lists, daily/weekly/total caps, expiry, idempotent consumption, suppression check — all in Postgres | ✅ Built & tested (19 DB tests) | — |
| Dashboard: 13 pages + prospect detail, dark/light, responsive, empty/loading/error states | ✅ Built, screenshot-verified | — |
| Auth (magic link), org bootstrap, roles (owner/admin/member/viewer) | ✅ Built | Supabase Auth |
| Agent 1 Lead Discovery: Claude web search → evidence-checked prospects, robots.txt-aware site audit, scoring | ✅ Built | `ANTHROPIC_API_KEY` |
| Agent 2 Sales Rep: personalised drafts, compliance linting, approval requests, reply sync + classification, opt-out/bounce suppression, follow-up drafts | ✅ Built | Anthropic + Gmail OAuth (or SMTP for send-only) |
| Agent 3 CRM Manager: 0–100 weighted scoring, re-scoring on replies, tasks, daily brief | ✅ Built | Anthropic (brief degrades gracefully without) |
| Agent 4 Content Creator: weekly plans, carousels, Reel scripts/storyboards, brand-template JPEG rendering, Supabase Storage, approvals | ✅ Built | Anthropic; Meta to publish |
| Instagram publishing: container → status poll → publish, quota check, carousel/Reels, AI-content label | ✅ Built | Meta app + App Review |
| Agent 5 Growth Strategist: researched account lists verified via Business Discovery API, recommendations, manual-only engagement | ✅ Built | Anthropic; Meta for verified counts |
| Analytics: funnel, reply rates, campaign performance, IG reach/views/interactions/followers/link taps | ✅ Built | Meta Insights for social metrics |
| Durable jobs: Postgres queue, SKIP LOCKED claiming, idempotency keys, retries with jittered backoff, stale-lock recovery, dead-letter + notification | ✅ Built & tested | `CRON_SECRET`, Vercel Pro for 5-minute cron |
| Reel video production | ⏳ Not automated | Team films/edits; upload the video, then approve |
| Live end-to-end runs against Claude, Gmail and Meta | ⏳ Not exercised here | No credentials were available in the build environment |

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, repository map, key trade-offs
- [docs/SETUP.md](docs/SETUP.md) — environment variables, Supabase, Google, Meta, Vercel
- [docs/META.md](docs/META.md) — Instagram permissions and App Review
- [docs/SECURITY.md](docs/SECURITY.md) — approval model, secrets, outreach compliance, platform rules
- [docs/COSTS.md](docs/COSTS.md) — expected monthly operating costs
