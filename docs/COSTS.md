# Operating costs (estimates — verify current pricing)

| Item | Assumption | Monthly (USD) |
|---|---|---|
| Vercel Pro | 1 seat; needed for 5-minute cron | ~$20 |
| Supabase Pro | small database, backups | ~$25 |
| Claude — Lead Discovery | 10 prospects/day, ~30–40 web searches + ~150k input / 10k output tokens per run on Sonnet | ~$25–35 |
| Claude — Sales drafts & reply handling | ~150 drafts + ~40 replies/month | ~$4–8 |
| Claude — Content & growth research | weekly | ~$2–4 |
| Claude — daily brief | Haiku | < $1 |
| Gmail (Workspace seat you already have) | — | $0 extra |
| Meta Graph API | — | $0 |
| AI images (optional) | ~16 images/month | ~$1–3 |
| **Total** | | **≈ $75–95/month** |

Per-run token usage and estimated cost are recorded on every `agent_runs` row and shown on Agent Activity, so you can compare these estimates with reality after the first week. Rates used for the estimate are in `src/lib/ai/claude.ts` (`PRICING`, `WEB_SEARCH_USD_PER_CALL`); set a monthly spend limit in the Anthropic Console as a hard stop.

Supabase's free tier works for trials (Vault is available), but free projects pause after inactivity — not suitable once the scheduler is running. Vercel Hobby is for non-commercial use and limits cron to once a day.
