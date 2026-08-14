# RV Match — Architecture

> Scope note: this document describes the **V1 core-loop build** (see
> `IMPLEMENTATION_PLAN.md` for the exact kept/deferred feature list). It
> intentionally does not describe deferred subsystems (creator portal,
> generic feed-import framework, campaign/QR distribution, partner
> matching, billing) — those are not present in the codebase.

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
  `completed`/`failed`) processed by a worker (`src/server/video/worker.ts`,
  invoked by `scripts/run-video-worker.ts` and by the
  `/api/video-jobs/process` route for on-demand/dev processing). Failed
  jobs are retryable from the dealer inventory UI.
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
