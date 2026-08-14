# RV Match

RV Match is a video-first RV discovery marketplace: consumers watch
short vertical videos of RVs and react with **Pass / Like / Love / More
Like This**, the platform learns their preferences from that behavior,
and increasingly relevant recommendations lead to dealer leads with
real behavioral context attached. This repository is the V1 build of
that closed loop:

```
dealer inventory -> video (dealer-uploaded or auto-generated) -> consumer
swipes -> learned preferences -> better recommendations -> RV detail ->
dealer lead (with behavioral context) -> dealer pipeline -> attributable
sale -> admin verification -> pilot progress + dashboards update
```

**Scope note:** the original spec for this product describes a much larger
surface (creator/influencer portal, generic feed-import framework, campaign
distribution tools, couples matching, etc.). V1 is deliberately scoped down
to build the loop above to real, tested, production quality rather than
spread thin across every feature. See `IMPLEMENTATION_PLAN.md` for the full
kept/deferred list and reasoning.

## Architecture at a glance

- **Next.js 16** (App Router), **TypeScript strict**, **Tailwind CSS**,
  hand-built accessible UI primitives on Radix + CVA.
- **PostgreSQL** via **Supabase** (Auth, Storage, Postgres) in production;
  runs against any plain Postgres 15+ locally.
- **Drizzle ORM** for typed queries; plain SQL migrations in
  `supabase/migrations/`.
- **FFmpeg** renders real vertical (1080x1920) MP4s from dealer photos when
  no dealer video exists.
- **Zod** validates every form/CSV/API input.

Full details: `ARCHITECTURE.md` (system design), `DATA_MODEL.md` (schema),
`TESTING.md` (how to run/what's covered).

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local install, Docker, or a Supabase project)
- FFmpeg on `PATH` (`apt install ffmpeg` / `brew install ffmpeg`)

## Local setup (no Supabase project required)

This is the fastest path — it runs against a local Postgres database and a
built-in local auth provider (bcrypt + signed cookies) that mirrors
Supabase's `auth.users` shape closely enough that swapping to real Supabase
later is a one-env-var change (see "Using a real Supabase project" below).

```bash
npm install
cp .env.example .env.local
# .env.local's defaults already point at postgres://postgres:postgres@localhost:5432/rvmatch_dev

# Start Postgres if it isn't already running, e.g.:
#   sudo service postgresql start
# Then create the local database, apply the local-dev auth stub, and run
# all migrations in one step:
npm run db:local:setup

# Seed realistic, clearly-synthetic demo data (2 dealerships, 52 RVs,
# generated videos via FFmpeg, swipe history, leads, a verified sale):
npm run db:seed

npm run dev
# -> http://localhost:3000
```

`npm run db:seed` takes a few minutes on first run — it renders ~50 real
FFmpeg videos. Subsequent runs are fast for everything except that step.

## Using a real Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — from Project Settings → API.
   - `DATABASE_URL` — from Project Settings → Database → Connection string
     (URI, "Session" mode).
3. Apply migrations: `npm run db:migrate` (or `supabase db push` if you use
   the Supabase CLI — the SQL in `supabase/migrations/` is plain,
   CLI-compatible SQL).
4. Create a Storage bucket named `rv-match-media` (public read) — or set
   `SUPABASE_STORAGE_BUCKET` to whatever you name it.
5. The app automatically switches from the local auth/storage providers to
   real Supabase once `NEXT_PUBLIC_SUPABASE_URL` no longer contains the
   placeholder `your-project` string. No code changes needed.
6. Run `npm run db:seed` against this database if you want demo data (the
   seed script itself still creates its own local-style bcrypt users via
   direct SQL against `auth.users`, which works identically against a real
   Supabase Postgres instance since GoTrue stores users in that same table).

## Docker deployment

A self-contained topology that doesn't require a hosted Supabase project:
nginx → the Next.js app (production `standalone` build) → Postgres, plus
the video-generation and feed-import workers as their own long-lived
containers (the same worker processes described above, just run in Docker
instead of via cron/a bare process).

```bash
cp .env.example .env
# At minimum, replace SESSION_SECRET with a real random value.
docker compose up --build
```

This brings up five services (`db`, `migrate` — a one-shot job that applies
the local auth stub + all migrations, then exits — `app`, `video-worker`,
`feed-worker`, `nginx`), publishes the app on `http://localhost` (port 80
via nginx), and persists Postgres data, uploaded media, and (if `SMTP_*` is
unset) local dev-mode emails in named volumes across restarts. To point at
a real Supabase project instead of the bundled Postgres/auth stub, fill in
the Supabase variables in `.env` the same way as "Using a real Supabase
project" above — `docker-compose.yml`'s `db`/`migrate` services then become
unnecessary and can be removed from the `app`/worker services' `depends_on`.

`src/server/security/client-ip.ts` trusts only the `X-Real-IP` header that
`deploy/nginx.conf` sets from the actual TCP connection (`$remote_addr`),
never a client-supplied `X-Forwarded-For` — this is what the per-IP rate
limits on login/signup/dealer-apply key off of. If you put another load
balancer in front of this nginx, make sure it's the one actually
terminating client connections, or adjust `deploy/nginx.conf` to trust
*its* header instead.

**Not build-verified in this environment**: this sandbox's egress policy
blocks pulling base images from Docker Hub (confirmed via the proxy's own
status endpoint, not a transient failure), so `docker build`/`docker
compose up` could not actually be run here. What *was* verified: `next
build` with `output: "standalone"` (the mode the Dockerfile depends on)
succeeds and produces the exact directory structure (`server.js`,
`node_modules`, `public`, `.next/static`) the runtime stage copies, and
`docker compose config` parses `docker-compose.yml` cleanly with correct
variable resolution, service dependencies, and volume/command syntax. Run
a real `docker compose up --build` as the first smoke test in any
environment where Docker Hub is reachable.

## Environment variables

See `.env.example` for the full list with inline explanations. Everything
has a working local default except:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` — only needed for a real Supabase deployment.
- `SMTP_*` — only needed to send real email. Without it, lead-notification
  emails are written to `./local-mail/*.json` and logged to the console
  instead of being silently dropped.
- `SESSION_SECRET` — any long random string; used to sign the local-auth
  session cookie.

## Running tests

```bash
npm run typecheck      # tsc --noEmit
npm run lint            # eslint
npm run test             # Vitest — 54 unit/integration tests
npm run test:e2e        # Playwright — 16 end-to-end tests (needs seed data + dev server)
npm run build             # production build
```

See `TESTING.md` for what each suite covers and how to run a subset.

## Video generation worker

The dealer "Generate Automatic Video" button only **enqueues** a job
(`video_generation_jobs`, status `queued`) and returns immediately - it
never runs FFmpeg inline in the request. FFmpeg encoding a multi-photo
Ken-Burns video is real CPU/wall-clock work that can comfortably exceed a
serverless request's time budget, so a separate, dedicated worker process
claims and processes jobs on its own schedule:

```bash
npm run video:worker          # claims and processes every queued job once, then exits - for cron
npm run video:worker:daemon   # runs as a persistent process, polling every 30s until stopped - for a long-lived host/container
```

You must run one of these (via cron every 1-2 minutes, or as a persistent
daemon) for any queued video to actually generate - **nothing else
processes the queue**, including in local development. The dealer
dashboard polls and shows queued / processing / completed / failed status
so this is never silently stuck; a job stuck in `processing` for more than
15 minutes (e.g. a worker that crashed mid-job) is automatically reclaimed
back to `queued` on the next worker tick, up to 3 attempts, before being
marked `failed`.

Job claiming uses `SELECT ... FOR UPDATE SKIP LOCKED`, so it's safe to run
multiple worker instances (or overlapping cron runs) concurrently - each
claims a different job instead of racing to process the same one.

## Demo accounts

Created by `npm run db:seed` (password for all: `RvMatchDemo123!`):

| Role | Email |
|---|---|
| Platform admin | `admin@rvmatch.app` |
| Dealer owner (Rocky Mountain RV Center, Denver CO) | `owner@rockymountainrv.example` |
| Dealer owner (Sunshine State RV Superstore, Tampa FL) | `owner@sunshinestatervs.example` |

Consumers never need an account to use the product — anonymous browsing,
swiping, saving, and lead submission all work with zero signup. Creating an
account (`/signup`) carries forward everything from the anonymous session.

## Demo data disclosure

Everything `npm run db:seed` creates — dealerships, inventory, photos
(stylized placeholder cards, not real photography), videos, swipe history,
leads, and one sold+verified sale — is synthetic and clearly namespaced
(`*.example` emails, obviously-synthetic dealership names). The dealer and
admin dashboards show a small "Demo data" badge whenever
`NEXT_PUBLIC_DEMO_MODE=true` (the `.env.example` default). Set it to
`false` once real dealers/inventory replace the seed data.

## Known limitations

- **This sandbox's network policy blocks Docker Hub**, so `Dockerfile`/
  `docker-compose.yml` exist and were validated as far as this environment
  allows (`next build` with `output: "standalone"` and `docker compose
  config`) — see "Docker deployment" above for exactly what was and wasn't
  verified. The build itself was developed and tested against a local
  (non-Supabase) Postgres + a local auth/storage provider rather than a
  live Supabase project. The Supabase-targeted code path
  (`src/server/auth/supabase-provider.ts`, Supabase Storage upload in
  `src/server/storage/index.ts`) follows the documented `@supabase/ssr`
  and `@supabase/supabase-js` patterns but has not been exercised against a
  real project by this build — that's the one piece you should smoke-test
  first after connecting real Supabase credentials.
- **Local file storage** (the default without Supabase configured) writes
  to `public/media/`, which works for local dev and any traditionally
  hosted Node deployment, but **not** for serverless platforms with
  read-only filesystems (e.g. Vercel) — those require the Supabase Storage
  path to be configured.
- **Email** without `SMTP_*` configured writes to `./local-mail/` instead
  of sending — intentional, not a bug, so nothing is silently dropped in an
  unconfigured environment.
- **Rate limiting** (lead-form spam protection; per-IP and per-account
  limits on login, signup, and dealer applications via
  `src/server/security/client-ip.ts`'s `X-Real-IP`-only IP resolution) is
  in-memory, correct for a single-process deployment but not shared across
  multiple server instances — a horizontally-scaled production deployment
  should swap `src/server/security/rate-limit.ts` for a shared store (e.g.
  Redis). The IP resolution itself is safe to scale as-is as long as every
  instance still sits behind a proxy layer that sets `X-Real-IP` from the
  real client connection the same way `deploy/nginx.conf` does.
- **shadcn/ui components are hand-authored**, not pulled from the shadcn
  CLI registry — `ui.shadcn.com` is not reachable from this build
  environment's network policy. They follow the same Radix + CVA +
  Tailwind conventions the CLI generates.
- Features listed as "Explicitly deferred" in `IMPLEMENTATION_PLAN.md`
  (traditional search, partner/couples matching, creator portal, campaign
  distribution tools, generic feed-import framework, granular dealer
  employee permissions, full notification system, demand-intelligence
  suite, billing) are genuinely not built — not hidden behind a disabled
  flag, not stubbed to look built. Nothing in this repository claims to
  do something it doesn't.

## Project structure

```
src/app/                  Next.js routes (consumer, /dealer, /admin)
src/components/           UI components, grouped by feature area
src/server/                Server-only logic
  auth/                    Session/auth providers + guards
  db/                      Drizzle schema + client
  recommendation/          Scoring engine, intent scoring, preferences
  video/                    FFmpeg generation pipeline + job worker
  dealer/, admin/          Server actions for each dashboard
  validation/              Zod schemas
supabase/migrations/      Plain SQL migrations (source of truth for schema)
scripts/
  db/                       Migration runner + local bootstrap
  seed/                     Demo data seed script + catalog
  local-dev/                Local-only auth stub (never applied to real Supabase)
e2e/                        Playwright end-to-end tests
```
