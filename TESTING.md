# Testing

RV Match has two automated test suites: Vitest for unit/integration tests
and Playwright for end-to-end browser tests. Both are required to pass
before any change is considered done.

## Unit & integration tests (Vitest)

```bash
npm run test          # run once
npm run test:watch    # watch mode
```

296 tests across 61 files in `src/server/` (run `npx vitest run` for the
current count - this file describes the *kinds* of coverage that exist
rather than an exhaustive per-file table, since one would go stale
immediately as phases add files). A representative sample:

| File | What it covers |
|---|---|
| `pilot/logic.test.ts` | `computePilotStatus` / `daysRemaining` — pending/active/suspended pass-through, sales-threshold conversion checked before time-based `conversion_due`, edge cases at exact thresholds |
| `geo/zip-centroids.test.ts` | `geocodeZip` nearest-prefix fallback, `haversineMiles` distance math |
| `recommendation/attributes.test.ts` | `attributesForInventory` — price/length/sleeps bucketing, conditional boolean attributes (bunkhouse/toy_hauler/outdoor_kitchen only emitted when true) |
| `recommendation/preferences.test.ts` | `normalizedAttributeScore` tanh bounding and observation-count confidence damping |
| `recommendation/engine.test.ts` | `distanceScore` distance-decay behavior and radius filtering |
| `recommendation/purchase-intent.test.ts` | Integration test - real dealership/session/profile against local Postgres, exercises `computeIntentScore` against real rows |
| `recommendation/profile.test.ts` | Proves a dealer's view of a lead's behavior snapshot is scoped to that dealer's own inventory and never leaks a competing make/dealer preference (Phase 23) |
| `validation/inventory.test.ts` | `csvRowSchema` — required fields, enum rejection (no silent coercion), numeric bounds, year range |
| `validation/leads.test.ts` | `leadFormSchema` — email-or-phone-required refinement, consent-must-be-true |
| `validation/dealer.test.ts` | Dealer application/inventory form schemas |
| `dealer/rbac.test.ts` | Every dealer role/permission boundary (Owner/Sales Manager/Salesperson/Marketing) |
| `admin/funnel.test.ts` | First-10,000 funnel correctly segments every stage by first-touch source rather than aggregating |
| `admin/video-jobs.test.ts`, `admin/privacy-requests.test.ts` | Admin-only mutations (video-job retry, account-deletion fulfillment) - RBAC rejection + the actual effect |
| `email/escape-html.test.ts` | HTML-injection defense for every email body |
| `dealer/photo-validate.test.ts`, `photo-upload.test.ts` | Magic-byte content sniffing rejects a spoofed-Content-Type upload |
| `auth/actions.test.ts`, `dealer/application-actions.test.ts` | Per-IP and per-account rate limiting on login/signup/dealer-apply |
| `go/[code]/route.test.ts` | First-touch attribution captured once, on first creation only, never overwritten by a later visit through a different campaign |
| `proxy.test.ts` | The anonymous-session cookie set by middleware is visible to a same-request Route Handler read (the class of bug a unit test alone wouldn't catch - see git history) |

Most are pure-function unit tests with no I/O. Anything touching the
database is a genuine integration test against real local Postgres (not
mocked) and needs a reachable database — `vitest.setup.ts` reads
`DATABASE_URL` from `.env.local`, so run `npm run db:local:setup` (or point
`.env.local` at any Postgres with the migrations applied) before running
the suite.

Run a single file: `npx vitest run src/server/pilot/logic.test.ts`

## End-to-end tests (Playwright)

```bash
npm run db:local:setup   # if not already done
npm run db:seed          # e2e tests assume seeded demo data exists
npm run test:e2e
```

20 tests across 5 files in `e2e/`. `playwright.config.ts` starts `npm run
dev` automatically if nothing is already listening on `localhost:3000`
(`reuseExistingServer: true`, so it will reuse a server you already have
running instead of starting a second one). Tests run serially
(`fullyParallel: false`, `workers: 1`) against a single shared database, so
run order matters and tests avoid clobbering each other's data (e.g. the CSV
import test generates unique stock numbers per run).

| File | Tests | Covers |
|---|---|---|
| `consumer-journey.spec.ts` | 5 | Landing → discover; PASS/LIKE/LOVE/MORE-LIKE-THIS decisions; the 10-decision ZIP prompt and 20-decision match-results unlock; saving an RV anonymously then creating an account and confirming the save persisted; submitting a lead from an RV detail page and confirming it reaches the dealer's lead inbox |
| `dealer-journey.spec.ts` | 3 | Add an RV with a photo, generate its video via FFmpeg, publish it; CSV import (create + update by stock number, and an invalid-row error report); lead pipeline (status change + adding a note) |
| `admin-journey.spec.ts` | 2 | Dealer application approval flow; sale verification incrementing the dealer's pilot `verifiedSalesCount` |
| `expanded-features.spec.ts` | 4 | Traditional search (filter by RV type, confirm every result actually matches, clear filters); a submitted lead produces a real notification in the dealer's in-app inbox that persists as read after reload; a consumer toggling email opt-out and requesting account deletion from `/account`, both verified to persist across a reload rather than only reflecting local UI state; the full partner-matching invite → join handshake between two independent browser contexts (`/partner/[token]` transitioning from pending to joined) |
| `security.spec.ts` | 6 | Dealer A cannot view Dealer B's lead or inventory by guessing a URL; unauthenticated users are redirected away from `/dealer` and `/admin`; a dealer session cannot reach `/admin`; a consumer session cannot reach `/dealer` or `/admin` |

Running the full suite surfaced one real defect while `expanded-features.spec.ts`
was being written: `CookieNotice` (`src/components/cookie-notice.tsx`, added in
the Phase 23 privacy pass) rendered as a full-width bar pinned to
`fixed inset-x-0 bottom-0` at `z-50` on every page for a fresh visitor - on
pages where an interactive control sits low in the viewport (e.g. the lead
detail panel's "Add Note" button), the notice intercepted the click. This
affected real first-time visitors too, not just tests. Fixed by converting it
to a corner toast (`bottom-4 right-4`, bounded width) so it can no longer
overlap page content; confirmed by re-running the full suite clean afterward.

`admin-journey.spec.ts` uses isolated `browser.newContext()` sessions per
role rather than multiple tabs in one context — tabs in the same
`BrowserContext` share cookies, which previously caused a real bug where
logging in as admin silently overwrote a dealer's session cookie mid-test.

Run a single file: `npx playwright test e2e/security.spec.ts`
Run with a visible browser: `npx playwright test --headed`
Debug a failure: `npx playwright test --trace on` then open the trace with
`npx playwright show-trace <path>` (failures also auto-capture a trace and
screenshot under `test-results/`).

### Running e2e against a production build

The suite has also been run against `npm run build && npm run start`
(pointed at `localhost:3000` the same as dev) to confirm production-mode
behavior matches dev — no test is dev-server-specific.

## Full pre-commit check

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

`npm run test:e2e` is intentionally not part of this one-liner since it
needs seeded data and a running database; run it separately after the above
pass.
