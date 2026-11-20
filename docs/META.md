# Instagram / Meta setup

This app uses the **Instagram API with Facebook Login** (Graph API, default `v26.0`, configurable via `META_GRAPH_VERSION`).

## Prerequisites
- The WebCraft TT Instagram account is a **Professional (Business or Creator)** account.
- It is linked to a **Facebook Page** you administer.
- A Meta developer app of type **Business**, with the *Instagram* and *Facebook Login for Business* products.

## Permissions requested
| Permission | Used for |
|---|---|
| `instagram_basic` | read the account profile, media, Business Discovery |
| `instagram_content_publish` | create containers and publish posts, carousels, Reels |
| `instagram_manage_insights` | account and media insights (views, reach, interactions, follows, link taps) |
| `pages_show_list` | find the Page linked to the IG account |
| `pages_read_engagement` | required alongside Page-linked IG access |
| `business_management` | access assets owned by a Business portfolio |

While the app is in **Development mode**, these work for people with a role on the app (add yourself as admin/tester) — enough for WebCraft's own account. **Advanced Access via App Review** is only required if accounts without an app role will connect. If you go through review, Meta expects a screencast of each permission in use; Content Studio → Approval Queue → Calendar demonstrates publishing, and Analytics demonstrates insights. Business verification of WebCraft TT may also be requested.

## Redirect URI
Facebook Login → Settings → Valid OAuth Redirect URIs: `APP_URL/api/integrations/meta/callback`.

## How publishing works
1. `POST /{ig-user-id}/media` creates a container (for carousels, one child container per image with `is_carousel_item=true`, then a `CAROUSEL` parent). Image URLs are short-lived signed Supabase Storage URLs; images are JPEG as the API requires.
2. Poll `GET /{container-id}?fields=status_code` until `FINISHED` (the job reschedules itself every 60 s while `IN_PROGRESS`).
3. `POST /{ig-user-id}/media_publish` with `creation_id`.
4. Quota is checked first via `/content_publishing_limit`.
5. When any image was AI-generated, containers are created with `is_ai_generated=true` so Instagram shows its AI label.

Requests are signed with `appsecret_proof`. The long-lived Page token is stored in Supabase Vault, never in a table clients can read.

## What this app will not do
No automated follows, unfollows, likes, comments, DMs or scraping of Instagram. Audience research uses web search plus the official Business Discovery API, and produces a list for a human to act on manually.
