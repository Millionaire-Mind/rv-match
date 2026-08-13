# RV Match — Implementation Plan

This document tracks the phased build-out of RV Match V1 on the
`claude/rv-video-discovery-marketplace-t1dltz` branch.

## V1 scope decision (2026-08-12)

The original master spec describes a multi-quarter product surface
(creator/influencer portal, generic XML/JSON feed framework, full campaign
management, demand-intelligence suite, couples/partner matching, granular
dealer-employee permission matrix, elaborate multi-channel notifications,
billing infrastructure, advanced admin funnel segmentation). Building all of
it to production quality in one pass would trade real, tested functionality
for surface area.

**V1 is scoped down to prove one complete, real, end-to-end economic loop:**

```
dealer inventory
  -> mandatory vertical video (dealer-uploaded or FFmpeg auto-generated)
  -> consumer PASS / LIKE / LOVE / MORE LIKE THIS decisions
  -> behavioral preference learning
  -> increasingly relevant recommendations
  -> RV detail page
  -> qualified dealer lead (with behavioral context)
  -> dealer lead pipeline (dealer sees behavioral summary, updates status)
  -> attributable sale
  -> admin verification
  -> pilot progress + dealer/admin metrics update
```

Everything in this loop is built to production quality: real database
queries, real auth/authorization, real FFmpeg video rendering, real
recommendation math, real tests. Nothing outside the loop is stubbed to
*look* built — it is simply not built, and is listed below as explicitly
deferred.

### Kept in V1

- Consumer mobile-first video discovery feed (PASS/LIKE/LOVE/MORE LIKE THIS)
- Anonymous sessions (cookie-based), no signup wall before discovery
- Mandatory video per RV: dealer upload takes priority, FFmpeg
  photo-to-video generation is the guaranteed fallback
- Behavioral recommendation engine with configurable weights + exploration
- ZIP/geolocation + radius filtering
- RV Match results (preference profile + top matches + explanations)
- Saved RVs (anonymous + account)
- RV detail page with core CTAs (check availability, ask a question, save,
  share)
- Lead capture with behavioral attribution snapshot
- Dealer authentication + dealer accounts
- Dealer inventory CRUD + photo/video upload + CSV import (with validation
  report)
- Dealer lead inbox with pipeline (new -> ... -> sold/lost) and behavioral
  lead summaries
- Sale attribution workflow + admin verification
- 90-day / X-verified-sales founding-dealer pilot tracking (admin
  configurable)
- Basic, fully database-driven dealer + admin dashboards (no decorative
  charts)
- Event tracking (`behavioral_events`) sufficient to drive the above
- PWA (manifest, icons, service worker)
- Responsive layouts, WCAG-AA-oriented accessibility
- Security: RLS + server-side tenant isolation, input validation, rate
  limiting on public endpoints, spam guard on lead forms
- Unit/integration tests (Vitest) + Playwright e2e for the loop above

### Explicitly deferred (not built in V1)

- Creator/influencer referral portal
- Full demand-intelligence suite (aggregate market-gap analytics)
- Generic XML/JSON feed-import framework + scheduled feed refresh (CSV
  import only)
- Campaign management, QR distribution center, UTM funnel segmentation
- Traditional keyword/filter search mode (discovery feed is the only
  browse path in this V1)
- Couples/partner matching (invite links, shared match results)
- Multi-channel/multi-type notification system (only the new-lead email to
  the dealer, via the dev mail transport, is implemented)
- Granular dealer employee permission matrix (V1 has `owner` and `staff`
  dealer roles, not four distinct role types with differing per-feature
  permissions)
- Price-history/price-drop notifications
- Full admin funnel-by-segment analytics
- Stripe/billing integration (schema leaves room for it; no billing code)

If a later milestone needs any of the above, it should be added as a new
phase rather than assumed to already exist.

## Phases

- [x] Phase 0 — Repository inspection (empty repo, fresh build)
- [x] Phase 1 — Planning docs
- [x] Phase 2 — Project scaffold: Next.js App Router, TypeScript strict,
      Tailwind, hand-built accessible UI primitives (Radix + CVA — the
      shadcn CLI registry is not reachable from this sandboxed network, so
      components are authored directly in shadcn's own conventions),
      ESLint, Vitest, Playwright, Docker, branding config
- [ ] Phase 3 — Database schema (scoped to the loop above): users,
      dealerships, dealership_users, dealer_pilots, inventory +
      photos/videos/price history, video_generation_jobs,
      behavioral_events, consumer_preferences, swipe_decisions,
      saved_inventory, leads, lead_activity, attributed_sales,
      admin_configuration, audit_logs, anonymous_sessions
- [ ] Phase 4 — Typed DB layer (Drizzle ORM) + Zod schemas
- [ ] Phase 5 — Auth & authorization: Supabase Auth, anonymous session
      cookie + merge-on-signup, dealer owner/staff roles, tenant isolation
- [ ] Phase 6 — Consumer discovery feed
- [ ] Phase 7 — Recommendation engine + preference profile + intent scoring
- [ ] Phase 8 — RV Match results + location prompt
- [ ] Phase 9 — RV detail page + saved RVs
- [ ] Phase 10 — Lead capture + attribution
- [ ] Phase 11 — Automatic video generation pipeline (FFmpeg)
- [ ] Phase 12 — Dealer onboarding, inventory CRUD, CSV import
- [ ] Phase 13 — Dealer dashboard: core analytics, lead inbox, sale
      attribution, pilot tracking
- [ ] Phase 14 — Basic platform admin
- [ ] Phase 15 — PWA + responsive/accessibility pass
- [ ] Phase 16 — Seed data script
- [ ] Phase 17 — Unit/integration tests (Vitest)
- [ ] Phase 18 — Playwright end-to-end tests
- [ ] Phase 19 — Final quality audit, docs, lint/typecheck/test/build, push

## Known technical risks

1. **No production Supabase project exists yet.** Migrations are plain SQL
   under `supabase/migrations`, runnable against any Postgres 15+ instance.
   The user must run `supabase link` and apply migrations against their own
   project — documented in README.md as required external setup.
2. **FFmpeg** is installed in this container and declared as a
   Docker/production dependency; generation is a real FFmpeg pipeline.
3. **Email delivery** has no real provider without user-supplied
   credentials. A development mail transport writes to `local-mail/` and
   logs to console when `SMTP_*` env vars are absent.
4. **The shadcn CLI registry (`ui.shadcn.com`) is not reachable** from this
   sandbox's network policy (explicit 403 at the proxy). UI primitives were
   hand-authored using the same Radix + CVA + Tailwind approach shadcn
   generates, so behavior/accessibility is equivalent; this is documented
   here rather than silently worked around.
5. **Geolocation/distance** uses a bundled static ZIP-centroid dataset (US)
   so radius search works without an external geocoding API key.
