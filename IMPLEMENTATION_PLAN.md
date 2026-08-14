# RV Match — Implementation Plan

This document tracks the phased build-out of RV Match on the
`claude/rv-video-discovery-marketplace-t1dltz` branch.

## Scope

The original master spec is the source of truth for what this product
builds. An earlier revision of this document redefined that spec down to a
smaller "V1 loop" and listed most of the spec's own surface area (creator
portal, feed-import framework, campaign/QR distribution, traditional
search, couples/partner matching, a real notification system, granular
dealer-employee permissions, price-drop behavior, admin funnel
segmentation) as "explicitly deferred." That redefinition was incorrect and
has since been corrected: every one of those items is now built, tested,
and described below under the phase that built it. This section exists so
that mistake isn't repeated - the phase list is the actual record of what
exists.

**Permanently out of scope** - these are excluded by product category, not
deferred for a later milestone: checkout/payment processing or escrow,
a dealer-management-system (DMS) integration, lending/financing
origination, insurance, campground/trip planning, a social network or
public forums, a general service marketplace (repairs/parts/installers),
a manufacturer-facing portal, an AI chatbot/assistant, and any blockchain
component. None of these are hinted at, stubbed, or partially wired
anywhere in the codebase.

**Genuinely still open** (tracked honestly, not hidden): a production
Supabase project has not been connected (the app runs against local
Postgres + a local auth stub, which mirrors Supabase's shape closely
enough to swap in one env-var change); no real SMTP/payment/hosting
credentials exist; Docker Hub is unreachable from this sandbox's network
policy, so `docker build`/`compose up` were validated as far as possible
(see README.md "Docker deployment") but not run end-to-end. See README.md
"Known limitations" for the complete, current list.

The end-to-end loop the whole system is built around remains:

```
dealer inventory
  -> mandatory vertical video (dealer-uploaded or FFmpeg auto-generated)
  -> consumer PASS / LIKE / LOVE / MORE LIKE THIS decisions, or traditional search
  -> behavioral preference learning
  -> increasingly relevant recommendations
  -> RV detail page
  -> qualified dealer lead (with dealer-scoped behavioral context)
  -> dealer lead pipeline (assign, contact, update status)
  -> attributable sale
  -> admin verification
  -> pilot progress + dealer/admin/platform metrics update
```

Everything described in the phase list below is built to production
quality: real database queries, real auth/authorization, real FFmpeg video
rendering, real recommendation math, real tests. Nothing is stubbed to
*look* built - a feature not listed below is simply not built.

## Phases

### Original build (through the first audited handoff)

- [x] Phase 0 — Repository inspection (empty repo, fresh build)
- [x] Phase 1 — Planning docs
- [x] Phase 2 — Project scaffold: Next.js App Router, TypeScript strict,
      Tailwind, hand-built accessible UI primitives (Radix + CVA — the
      shadcn CLI registry is not reachable from this sandboxed network, so
      components are authored directly in shadcn's own conventions),
      ESLint, Vitest, Playwright, branding config
- [x] Phase 3 — Database schema: users, dealerships, dealership_users,
      dealer_pilots, inventory + photos/videos/price history,
      video_generation_jobs, behavioral_events, consumer_preferences,
      swipe_decisions, saved_inventory, leads, lead_activity,
      attributed_sales, admin_configuration, audit_logs, anonymous_sessions
- [x] Phase 4 — Typed DB layer (Drizzle ORM) + Zod schemas
- [x] Phase 5 — Auth & authorization: Supabase Auth, anonymous session
      cookie + merge-on-signup, dealer roles, tenant isolation
- [x] Phase 6 — Consumer discovery feed
- [x] Phase 7 — Recommendation engine + preference profile + intent scoring
- [x] Phase 8 — RV Match results + location prompt
- [x] Phase 9 — RV detail page + saved RVs
- [x] Phase 10 — Lead capture + attribution
- [x] Phase 11 — Automatic video generation pipeline (FFmpeg)
- [x] Phase 12 — Dealer onboarding, inventory CRUD, CSV import
- [x] Phase 13 — Dealer dashboard: core analytics, lead inbox, sale
      attribution, pilot tracking
- [x] Phase 14 — Basic platform admin
- [x] Phase 15 — PWA + responsive/accessibility pass
- [x] Phase 16 — Seed data script
- [x] Phase 17 — Unit/integration tests (Vitest)
- [x] Phase 18 — Playwright end-to-end tests (consumer, dealer, admin,
      security journeys)
- [x] Phase 19 — Final quality audit, docs, lint/typecheck/test/build, push

### Correction and completion pass (audited base commit `6ea8df1`)

A full audit against the original master spec found real defects in the
phases above and substantial spec surface area the earlier "V1 scope
decision" had incorrectly written off as deferred. Every phase below
either fixes a defect or builds previously-missing spec-required surface
area to the same production-quality bar as the original build - real
queries, real auth, real tests, nothing stubbed to look built.

- [x] Phase 1A — Fixed a cross-dealer inventory IDOR (a dealer user could
      act on another dealership's inventory/videos/jobs by id)
- [x] Phase 1B — Fixed a `profiles.platform_role` privilege-escalation gap
      in RLS
- [x] Phase 1C — Sale-attribution uniqueness constraint + transactional
      writes (prevented duplicate/racing sale records)
- [x] Phase 1D — Implemented real Supabase SSR session refresh in
      middleware (was previously a no-op for the Supabase auth path)
- [x] Phase 2 — Committed `.env.example`, moved video generation off the
      request path onto a dedicated worker process, added a seed-safety
      guard against running the demo seed against a real database
- [x] Phase 3 — Full dealer RBAC: Owner / Sales Manager / Salesperson /
      Marketing roles with distinct per-feature permissions (the earlier
      "owner/staff only" model the old scope note described)
- [x] Phase 4 — Enforced mandatory video-first discovery end to end
      (`discoveryEligible()` - published alone was never sufficient, but an
      earlier gap let a published/video-less RV leak into some surfaces)
- [x] Phase 5-6 — Fixed MORE LIKE THIS immediacy, behavioral-event
      integrity, and added real watch-behavior analytics (completion rate,
      replay, drop-off)
- [x] Phase 7 — Fixed dealer-entered inventory never being geocoded on the
      write path (radius filtering silently didn't work for real dealer
      data, only seed data)
- [x] Phase 8 — Traditional keyword/filter search as a second browse path
      alongside the swipe feed, plus "Show Me Similar RVs"
- [x] Phase 9 — Couples/partner matching: invite links, independent
      per-partner swipe history, shared-match results
- [x] Phase 10 — Completed the RV detail/saved-RV CTA set (trade estimate,
      financing info, call-dealer tracking, find-similar-when-sold)
- [x] Phase 11-12 — Lead intelligence completeness (more purchase-intent
      signals) and full purchase-intent scoring coverage
- [x] Phase 13-14 — Full inventory field set (dimensions, weights, bed
      configuration, interior) and a generic XML/JSON/CSV feed-import
      framework with scheduled refresh (not CSV-only)
- [x] Phase 15-16 — Per-RV dealer analytics and demand-intelligence
      (market-gap signal from swipe behavior on published inventory)
- [x] Phase 17-19 — Distribution/QR center, durable first-touch
      attribution (session -> lead -> sale, never overwritten), creator
      referral links and management
- [x] Phase 20-21 — Full in-app + email notification system (9 trigger
      points across consumer and dealer surfaces) and price-history
      consumer behavior (price-drop badge + saved-RV notification)
- [x] Phase 22 — Admin platform ops (users, consumers, inventory, video
      jobs with retry, leads, campaigns, sale verification, creators,
      config) and the First-10,000 acquisition funnel segmented by
      first-touch source
- [x] Phase 23 — Privacy Policy, Terms of Service, cookie notice, and real
      consumer data rights: self-service data export, a reviewed account-
      deletion request flow, and an email-notification opt-out. Also fixed
      a real cross-dealer privacy leak: a lead's frozen behavioral
      snapshot previously showed the receiving dealer a shopper's
      platform-wide activity (including which competing make/dealer they'd
      responded to) instead of only that dealer's own inventory
- [x] Phase 25-26 — Dockerfile + docker-compose.yml + nginx (the
      self-contained deployment topology ARCHITECTURE.md had described but
      never shipped) and closed a real gap where login/signup had no rate
      limiting at all, via a trusted-proxy-header (`X-Real-IP`-only) IP
      resolution that can't be spoofed via a client-supplied
      `X-Forwarded-For`
- [x] Phase 27-29 — Remaining named technical findings: HTML-injection in
      emails, a config-save that silently crashed after already
      committing, spoofable photo-upload validation, unbounded numeric
      inputs, missing error boundaries, and no structured server-side
      error logging
- [x] Phase 30-32 — Expanded test coverage (a new Playwright spec covering
      traditional search, notifications, account privacy, and partner
      matching - the four largest correction-pass features that had zero e2e
      coverage), a real clean-setup validation pass, and this documentation
      correction. Writing that coverage surfaced one real defect: the cookie
      notice banner could overlap and block clicks on page controls near the
      bottom of the viewport for a first-time visitor (fixed in
      `cookie-notice.tsx` - see TESTING.md)

See README.md for how to run everything and "Known limitations" for what's
genuinely still open (distinct from what was ever built).

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
