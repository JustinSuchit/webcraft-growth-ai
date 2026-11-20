# Setup

## 1. Supabase
1. Create a project (Pro recommended for production: daily backups, no pausing).
2. Install the CLI and apply migrations:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push        # applies supabase/migrations/*
   ```
3. Auth → URL configuration: Site URL = `APP_URL`; add `APP_URL/auth/callback` to redirect URLs.
4. Auth → Providers → Email: keep magic link on. **Disable public sign-ups** once your team has signed in (invite others from the dashboard). The first person to sign in creates the workspace and becomes owner.
5. Copy the URL, anon key and service-role key into Vercel env vars. The service-role key must never be exposed with a `NEXT_PUBLIC_` prefix.

## 2. Secrets
```bash
openssl rand -base64 48   # STATE_SIGNING_SECRET
openssl rand -hex 24      # CRON_SECRET
```

## 3. Anthropic
Create an API key at console.anthropic.com and set `ANTHROPIC_API_KEY`. Web search must be enabled for your organization in the Console (it is billed per search). Set a monthly spend limit there.

## 4. Gmail
1. Google Cloud console → new project → enable **Gmail API**.
2. OAuth consent screen: if `webcraft.tt` uses Google Workspace, choose **Internal** — this avoids Google's verification/CASA review for the restricted `gmail.readonly` scope. (An External app would need verification before others could use it.)
3. Credentials → OAuth client (Web). Authorised redirect URI: `APP_URL/api/integrations/gmail/callback`.
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, then Settings → **Connect Gmail** as an owner/admin, using the mailbox outreach should come from.
5. Deliverability: make sure SPF, DKIM and DMARC are configured for the sending domain. Start with a low daily cap (Settings → Email cap/day, e.g. 15) and raise it gradually.

**SMTP alternative:** set `SMTP_URL` instead; sending works, but replies aren't synced (forward them to a connected Gmail if needed).

## 5. Instagram
See [META.md](META.md). Then Settings → **Connect Instagram**.

## 6. Vercel
1. Import the repo; framework preset Next.js. Add all env vars from `.env.example`.
2. `vercel.json` registers two cron jobs: `/api/cron/tick` every 5 minutes and `/api/cron/daily` at 11:00 UTC (07:00 in Trinidad). **5-minute cron needs Vercel Pro**; Hobby only allows once-daily jobs (and is for non-commercial use). On Hobby, change `tick` to daily or call it from an external scheduler with the `Authorization: Bearer $CRON_SECRET` header.
3. Function max duration is 60 s per invocation; the worker stops claiming new jobs ~5 s before its budget and anything unfinished resumes on the next tick.

## 7. First run checklist
- Settings → fill sender identity (name, **postal address**, website). Emails won't send without a sender.
- Agent Activity → run Lead Discovery; review prospects in the CRM.
- Draft outreach from a prospect page, or create a campaign. Approve in the Approval Queue.
- Studio → Plan next week → approve posts individually, or request a schedule approval from the Calendar.

## Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | live | browser + user-scoped server client |
| `SUPABASE_SERVICE_ROLE_KEY` | live | agents & jobs (server only) |
| `APP_URL` | live | OAuth redirects, unsubscribe links |
| `STATE_SIGNING_SECRET` | live | OAuth state, unsubscribe tokens |
| `CRON_SECRET` | live | authenticates Vercel Cron |
| `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_FAST`) | agents | Claude |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | email | Gmail OAuth |
| `SMTP_URL` | alt. email | send-only |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` | Instagram | Graph API |
| `IMAGE_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` | optional | AI imagery |
