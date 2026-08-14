# RV Match — Architecture

> See `IMPLEMENTATION_PLAN.md` for the phase-by-phase build history and
> what's permanently out of scope (checkout/payments, DMS integration,
> lending, insurance, trip planning, a social network, a chatbot,
> blockchain). Everything else described below - including the creator
> portal, generic feed-import framework, campaign/QR distribution, and
> partner matching an earlier revision of this document said weren't
> present - is built and covered by this document.

## Overview

RV Match is a Next.js App Router monolith backed by PostgreSQL via Supabase.
It serves three experiences from one codebase:

1. **Consumer** (`/`, `/discover`, `/rv/[id]`, `/match`, `/saved`) —
   mobile-first, video-dominant.
2. **Dealer** (`/dealer/...`) — desktop-first dashboard, usable on mobile.
3. **Admin** (`/admin/...`) — platform operations console.

All three share the same database, the same recommendation/attribution
engine, and the same event-tracking pipeline, because the product thesis is
a single closed loop:

```
dealer inventory -> video -> consumer decisions -> preference learning
  -> recommendations -> RV detail -> lead -> dealer pipeline -> sale
  -> admin verification -> pilot/metrics
```

## Frontend

- **Next.js App Router**, TypeScript strict mode, React Server Components by
  default; client components only where interactivity (swipe gestures, video
  playback, forms) requires it.
- **Tailwind CSS** + hand-authored accessible UI primitives
  (`src/components/ui/*`) built directly on **Radix UI primitives** +
  **class-variance-authority**, following the same conventions the shadcn/ui
  CLI generates. The shadcn registry (`ui.shadcn.com`) is not reachable from
  this sandbox's network policy (blocked at the outbound proxy), so
  components are authored by hand rather than fetched — functionally and
  accessibility-wise equivalent, documented here rather than silently
  worked around. Consumer UI adds a Framer Motion layer for swipe/transition
  polish.
- **Server Actions** handle nearly all writes (swipe decisions, saves, lead
  submission, inventory CRUD, lead pipeline updates) so there is no separate
  REST layer to keep in sync. A small set of **Route Handlers**
  (`app/api/**`) exists where a stable HTTP contract is needed: client-side
  event beacons, CSV import upload, video job processing, and the PWA
  manifest/service worker.
- **State**: server is the source of truth. Anonymous session id lives in an
  HTTP-only cookie (`rvm_session`); client-side ephemeral UI state (current
  card index, video mute) lives in React state, not global stores.

## Backend / data access

- **Supabase** provides Postgres, Auth (email/password), and Storage
  (photos, dealer-uploaded videos, generated videos).
- **Drizzle ORM** is the typed query layer over the same Postgres database
  Supabase manages — migrations are plain SQL (`supabase/migrations/*.sql`)
  and `src/server/db/schema.ts` mirrors them for typed queries. RLS policies
  (Postgres-native) are the authoritative authorization layer; Drizzle gives
  the app compile-time safety on top.
- **Zod** schemas in `src/server/validation/*` are the single source of
  truth for input validation, reused by server actions and route handlers.
- **Authorization** is enforced twice: RLS policies at the database level
  (so even an application bug can't leak another dealer's rows), and an
  application-level `requireDealerRole()` / `requireAdmin()` guard at the
  top of every server action/route handler that touches dealer or admin
  data.

## Recommendation engine

`src/server/recommendation/` implements a deterministic, explainable
scoring engine (`engine.ts`):

1. Every `swipe_decision` and relevant `behavioral_event` updates a row in
   `consumer_preferences` (one row per consumer/session per attribute-value
   pair — e.g. `attribute='rv_type', value='travel_trailer'`) using signed
   weights loaded from `admin_configuration` (`recommendation_weights`
   key), never hardcoded, so admins can retune them from `/admin/config`.
2. Scores combine into a candidate RV's fit score: weighted sum across
   matching attributes, multiplied by a geographic relevance factor
   (distance decay within the selected radius, using the Haversine formula
   over a bundled ZIP-centroid table) and a price-affinity factor (Gaussian
   around the consumer's observed price band).
3. **Exploration**: a configurable fraction (`explorationRate`, default
   15%) of each served batch is chosen outside the top-fit set so the
   profile keeps learning and consumers aren't trapped in a filter bubble.
4. `purchase-intent.ts` computes the 0-100 lead intent score the same way —
   configurable weights over signals (availability request, saves,
   dealer/detail views, repeat sessions, proximity) — and returns the
   human-readable "reasons" list shown to dealers.
5. Both are unit tested (`src/server/recommendation/*.test.ts`) against
   fixture behavior sequences so scoring changes are caught by tests.

## Video pipeline

`src/server/video/` implements automatic vertical video generation:

- `generate.ts` shells out to **FFmpeg** to build a 1080x1920 H.264 MP4 from
  an RV's photos: per-photo Ken-Burns zoom/pan via FFmpeg's `zoompan`
  filter, crossfades between photos, and a `drawtext` overlay pass burning
  in year/make/model, price, one factual highlight feature, dealer name,
  and a CTA frame — all sourced directly from inventory columns, never
  invented.
- Jobs are rows in `video_generation_jobs` (`queued` -> `processing` ->
  `completed`/`failed`) processed by a dedicated worker
  (`src/server/video/worker.ts`), invoked by `scripts/run-video-worker.ts`
  (one-shot for cron, or `--loop` as a persistent daemon - see README.md
  "Video generation worker"). Failed jobs are retryable from both the
  dealer inventory UI and, platform-wide, `/admin/videos`.
- Dealer-uploaded video always outranks a generated video:
  `inventory.primary_video_id` is set explicitly by the dealer, and
  generation only auto-assigns itself as primary when no video exists yet.

## Event analytics

`src/server/analytics/track.ts` is the single write path for the
`behavioral_events` table (page views, video milestones, swipes, saves,
detail views, lead funnel events), called from both server actions and a
small client `trackEvent()` helper (`/api/events`, `sendBeacon` on unload)
for client-only signals like video-progress milestones. All dashboard
numbers (dealer + admin) are SQL aggregations over this table and the
domain tables (`leads`, `attributed_sales`, `swipe_decisions`) — there is no
separate "analytics service" and no hardcoded metric outside of the
explicitly-labeled demo seed data itself.

## Attribution

Each lead stores a behavioral snapshot at submission time (RVs viewed,
likes/loves, saves, match score, prior dealer views) computed from the
consumer's/session's `behavioral_events` and `swipe_decisions`, so the
dealer sees *why* a lead is high- or low-intent without receiving raw event
logs. Sale attribution (`attributed_sales`) links back to the originating
lead and RV; if the consumer bought a different unit from the same
dealership, the record still preserves RV Match as the acquisition source.

## Traditional search

`/search` (`src/server/search/query.ts`) is a second browse path alongside
the swipe feed, not a replacement for it - filter by type/make/model/year/
price/dimensions/amenities/location, sorted by relevance/price/recency.
Draws from the same `discoveryEligible()` pool (published + has a video)
as the swipe feed, so search never surfaces an RV the feed would withhold.
"Show Me Similar RVs" from a search result or RV detail page feeds that RV
into the preference engine the same way MORE LIKE THIS does mid-swipe,
then routes back into personalized discovery - search and the learning
feed are one system, not two.

## Partner matching

"Compare With My Partner" (`src/server/partner/`) lets two consumers build
independent swipe histories under one shared invite link
(`partner_links`), then view the RVs they both scored highly on
(`getSharedMatches`, the minimum of each partner's fit score) once both
cross the match-complete decision threshold. Each partner's preference
profile stays fully separate; only the shared-match view reads both.

## Distribution, attribution, and creators

Every QR code, dealer-generated link, and creator referral link resolves
through one route, `/go/[code]` (`distribution_campaigns`), which records
first-touch attribution on an anonymous session's *first* creation only -
`getOrCreateAnonymousSessionId`'s `onConflictDoUpdate` deliberately never
touches `firstSource`/`firstCampaignId` on a later visit, so a shopper's
original acquisition source is never overwritten by a subsequent visit
through a different link. That attribution is copied (frozen, not
re-derived) onto a lead at submission and onto an attributed sale at
verification, so editing a campaign afterward can't retroactively change
what a past lead or sale is attributed to. Dealers manage their own QR/
link campaigns from `/dealer/distribution`; platform admins manage
creators and creator-specific campaigns from `/admin/creators`, and can
deactivate any campaign platform-wide from `/admin/campaigns`.

## Generic feed import

Beyond manual CSV upload, dealers can register a remote feed
(`inventory_feed_sources` - CSV/JSON/XML, with a configurable field
mapping and refresh interval) that a dedicated worker
(`scripts/run-feed-import.ts`, mirroring the video worker's one-shot/
`--loop` pattern) fetches and upserts on schedule (`inventory_feed_runs`
records each run's outcome). Both manual CSV import and feed import share
one upsert path (`src/server/dealer/inventory-upsert.ts`) so price-history
tracking, geocoding, and feature-list handling can't drift between the two
entry points. Feed URLs are validated against SSRF before every fetch
(`assertPublicFeedUrl` rejects loopback/RFC1918/link-local hosts).

## Notifications

A single `notifications` table backs both consumer and dealer inboxes
(`/notifications`, `/dealer/notifications`), written by
`src/server/notifications/create.ts` for nine trigger points (new/high-
intent/appointment leads, sale-awaiting-verification, video-generation
failure, saved-RV sold, price drop, strong new-listing match, partner-
match-complete). Email is a best-effort bonus channel on top of the always-
written in-app record: attempted for a dealer user always, for a consumer
only when they resolve to a signed-up account with email notifications not
opted out (`consumer_profiles.email_opt_out`). Every dynamic value
interpolated into an email's HTML body is escaped
(`src/server/email/escape-html.ts`) before being sent.

## Platform administration

`/admin` covers the whole system, not just dealer approval and sale
verification: platform users, consumers (engagement-ranked), inventory and
video-generation jobs (with a real retry action for a permanently-failed
job) across every dealership, leads, distribution campaigns, creators,
account-deletion requests, and configuration (recommendation/intent
weights, pilot defaults, platform thresholds). `/admin/funnel` breaks the
core acquisition funnel (sessions -> activated shoppers -> accounts ->
leads -> verified sales) out by real first-touch source rather than only
showing an aggregate - see "Distribution, attribution, and creators" above
for how that attribution is captured and frozen.

## Privacy and data rights

`/account` gives a consumer three real, working controls: download
everything tied to their identity as JSON (`/api/account/export`, purely
self-service - no request/approval step needed since it's read-only),
toggle email notifications, and request account deletion. Deletion is
request-based rather than instant self-service (`account_deletion_requests`,
fulfilled from `/admin/privacy-requests`) because a dealer may have a
legitimate business reason to retain a lead a consumer submitted to them
even after that consumer's shopper profile is gone - the FK from `leads`
to `consumer_profiles` is `on delete set null`, so deleting the profile
detaches it from the lead without touching the dealer's own record.

## Deployment

- `Dockerfile` (multi-stage, `runner`/`worker` targets) + `docker-compose.yml`
  run nginx, the Next.js app (`output: "standalone"`), a Postgres container
  (for fully-local dev without a hosted Supabase project), and the
  video-worker and feed-worker processes as their own containers — see
  README.md "Docker deployment" for usage and exactly what was/wasn't
  build-verified in this environment (Docker Hub is network-policy-blocked
  here).
- nginx is the only component allowed to set `X-Real-IP`, from its own view
  of the TCP connection (`$remote_addr`) — `src/server/security/client-ip.ts`
  trusts that header alone (never a client-suppliable `X-Forwarded-For`) for
  the per-IP rate limits on login/signup/dealer-apply.
- Production target is Vercel (or any Node host) for the app + a hosted
  Supabase project for Postgres/Auth/Storage; the video worker runs as a
  long-lived process/cron (documented in README.md). If deploying behind a
  platform-managed proxy/LB instead of the bundled nginx, whatever sets the
  trusted client-IP header needs to match what `client-ip.ts` reads.
