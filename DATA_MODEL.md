# RV Match — Data Model

Source of truth: `supabase/migrations/*.sql`. This document is a readable
map of that schema, grouped by the phase of the loop each table supports.
Mirrored types for the app live in `src/server/db/schema.ts` (Drizzle).

## Identity

- **profiles** — one row per Supabase Auth user (consumer or dealer/admin
  human). Created automatically by an `on_auth_user_created` trigger.
  `platform_role`: `consumer` | `platform_admin`.
- **anonymous_sessions** — one row per anonymous browser, keyed by the
  `rvm_session` cookie. `merged_into_user_id` is set when the visitor
  creates an account.
- **consumer_profiles** — the stable "shopper identity" every behavioral
  row references, whether the shopper is anonymous or signed in. Exactly
  one of `user_id` / `anonymous_session_id` is set. **Account merge** is
  implemented by attaching `user_id` to the *existing* anonymous
  `consumer_profiles` row on signup rather than creating a second identity
  — all prior swipes/saves/preferences carry forward untouched.

## Dealerships

- **dealerships** — application → `pending` → admin approval → `approved`.
- **dealership_users** — membership + role (`owner` | `staff`) linking a
  `profiles` row to a `dealerships` row.
- **dealer_pilots** — one row per dealership. Free for `trial_days` (default
  90) **or** `sales_threshold` (default 3) verified sales, whichever comes
  first; both are overrideable per dealer. `status`: `pending` → `active` →
  `conversion_due` → `converted` / `expired` / `suspended`.
  `verified_sales_count` increments only when an admin verifies a reported
  sale (see `attributed_sales`).

## Inventory

- **inventory** — the RV listing itself: identity (year/make/model/
  floorplan/VIN/stock number), pricing (MSRP/sale/advertised, all in
  cents), dimensions/weights, `bunkhouse`/`toy_hauler`/`outdoor_kitchen`
  flags, `status` (`draft`/`published`/`sold`/`archived`),
  `primary_photo_id` / `primary_video_id`.
- **inventory_features** — free-text feature tags (`(inventory_id,
  feature)` unique).
- **inventory_photos** — ordered photo URLs.
- **inventory_videos** — one row per video, `source`: `dealer_upload` |
  `generated`. `inventory.primary_video_id` points at whichever the dealer
  (or, absent a dealer choice, the generation pipeline) designates as
  primary — dealer uploads always take priority when present.
- **inventory_price_history** — append-only price change log.
- **video_generation_jobs** — FFmpeg job queue: `queued` → `processing` →
  `completed`/`failed`, with `attempts` for retry and `output_video_id`
  pointing at the resulting `inventory_videos` row.

## Behavior & recommendation

- **swipe_decisions** — one row per `(consumer_profile_id, inventory_id)`
  (upserted, so re-serving an already-swiped RV updates rather than
  duplicates); `decision`: `pass` | `like` | `love` | `more_like_this`.
- **saved_inventory** — bookmark join table.
- **behavioral_events** — append-only event stream (`event_type` is a
  checked text column, not a hard enum, so new event types don't require a
  blocking migration). Every dashboard number is a SQL aggregation over
  this table plus the domain tables — nothing is hardcoded.
- **consumer_preferences** — the learned preference vector:
  `(consumer_profile_id, attribute, value) -> score, observations`. Written
  by `src/server/recommendation/engine.ts` using weights from
  `admin_configuration`.

## Leads & sales

- **leads** — one row per lead submission: contact info, `cta_type`,
  `match_score`/`intent_score` computed at submission time,
  `behavior_snapshot` (a small denormalized JSON summary — RVs viewed,
  likes/loves/saves, top preferences — so the dealer gets a readable
  summary rather than raw event logs), and a `status` pipeline (`new` →
  `contacted` → `appointment` → `showroom` → `negotiation` → `sold` /
  `lost`).
- **lead_activity** — audit trail of status changes, notes, and assignment
  on a lead.
- **attributed_sales** — a reported sale tied back to its originating
  `lead_id`; `sold_inventory_id` may differ from the lead's original RV
  (`is_original_lead_rv=false`) while still crediting RV Match as the
  source. `verification_status`: `dealer_reported` → `verified` /
  `rejected` by a platform admin. Only `verified` sales count toward
  `dealer_pilots.verified_sales_count`.

## Admin & audit

- **admin_configuration** — `key -> jsonb value` store for
  `recommendation_weights`, `intent_weights`, `pilot_defaults`, and
  `platform` (activation thresholds). Loaded at request time; tunable from
  `/admin/config` without a deploy.
- **audit_logs** — actor, action, entity, and dealership for sensitive
  dealer/admin actions (approvals, sale verification, config changes,
  inventory status changes).

## Authorization model

Every table has Row Level Security enabled. Two helper functions,
`is_platform_admin()` and `is_dealership_member(dealership_id)`, back
policies that scope dealer-facing tables to members of that dealership and
admin-only tables to `platform_role = 'platform_admin'`. Published
inventory (and its photos/videos/features) is publicly readable so the
discovery feed works for anonymous visitors on the public anon key.

RLS is defense-in-depth. The application itself never exposes PostgREST to
the browser — all reads/writes go through Next.js server actions/route
handlers, which independently call `requireDealerRole(dealershipId)` or
`requireAdmin()` (see `src/server/auth/guards.ts`) before touching the
database. This is what the tenant-isolation security tests exercise
directly.

## Deferred from the schema (see IMPLEMENTATION_PLAN.md)

No tables exist yet for: creators, campaigns/acquisition_sessions,
partner_invites/partner_matches, searches, inventory_feed_sources,
inventory_import_jobs (beyond the CSV path, which doesn't need a persisted
job table in V1), or a general-purpose notifications table (the one
notification V1 sends — new lead to dealer — is a direct email send, not a
queued/stored notification). Adding any of these later is additive and
does not require reworking the tables above.
