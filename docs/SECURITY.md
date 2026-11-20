# Security & compliance

## Approvals (see ARCHITECTURE.md for the mechanism)
- New external communications and publications always require an owner/admin approval.
- A **message approval** covers one exact email; a **campaign approval** covers first-touch emails to a fixed recipient snapshot within daily/total caps until expiry; **follow-up replies are never covered by a campaign** and are approved one by one; a **post approval** covers one exact post; a **schedule approval** covers a fixed list of posts, unchanged, within a weekly cap.
- Approval decisions use optimistic concurrency (`expectedUpdatedAt`) so you can't approve something that changed while you were reading it.
- Every decision, send, publish, suppression and credential change is written to `activity_logs` (append-only, enforced by trigger).

## Secrets
- OAuth refresh/page tokens are stored in **Supabase Vault** via `store_integration_secret()`; `integration_credentials_metadata` holds only labels and the Vault id. Reading a secret (`get_integration_secret`) is granted to the service role only.
- Service-role and API keys are server-only env vars. Cron routes compare the bearer token in constant time. OAuth uses signed, expiring `state` plus an httpOnly nonce cookie bound to the signed-in user.
- RLS is enabled and forced on every table; `tests/db/rls.test.ts` checks cross-org isolation, admin-only credential metadata and that users cannot call privileged functions.

## Outreach rules
- Only business contact details **published by the business** are stored, with the source URL. No guessed addresses.
- Drafts are linted (`src/lib/compliance/outreach-rules.ts`) for fake "Re:" subjects, implied prior conversations, guarantees, pressure language, claims of being human, invented testimonials and unfilled placeholders.
- Every email gets a server-appended footer with sender identity, postal address, an AI-assistance disclosure and an unsubscribe link; headers include `List-Unsubscribe` and RFC 8058 one-click.
- Opt-outs (link, one-click, or a reply such as "unsubscribe") and bounces are added to `suppression_list` immediately. Suppression is checked inside `consume_approval()`, so no code path can send to a suppressed address. Marking a prospect *Do Not Contact* suppresses all its emails.
- One first-touch per contact (idempotency key), org-wide daily cap, sends spaced ~2 minutes apart.
- Trinidad and Tobago's Data Protection Act and the anti-spam laws of other Caribbean jurisdictions (and CAN-SPAM/CASL/GDPR where recipients are covered) differ; this is engineering guidance, not legal advice — have counsel confirm your outreach policy before scaling.

## Web research
- Research goes through Claude's web search; prospect sites are fetched directly at most once per research pass, only when `robots.txt` allows, with an identifying user agent.
- Never fabricate: unverified evidence is discarded or flagged; agents may only state WebCraft facts listed in `profile.ts`; client work requires a recorded authorisation note (DB check constraint) before it can appear in portfolio content.
