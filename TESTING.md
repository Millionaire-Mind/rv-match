# Testing

RV Match has two automated test suites: Vitest for unit/integration tests
and Playwright for end-to-end browser tests. Both are required to pass
before any change is considered done.

## Unit & integration tests (Vitest)

```bash
npm run test          # run once
npm run test:watch    # watch mode
```

54 tests across 9 files in `src/server/`:

| File | What it covers |
|---|---|
| `pilot/logic.test.ts` | `computePilotStatus` / `daysRemaining` — pending/active/suspended pass-through, sales-threshold conversion checked before time-based `conversion_due`, edge cases at exact thresholds |
| `geo/zip-centroids.test.ts` | `geocodeZip` nearest-prefix fallback, `haversineMiles` distance math |
| `recommendation/attributes.test.ts` | `attributesForInventory` — price/length/sleeps bucketing, conditional boolean attributes (bunkhouse/toy_hauler/outdoor_kitchen only emitted when true) |
| `recommendation/preferences.test.ts` | `normalizedAttributeScore` tanh bounding and observation-count confidence damping |
| `recommendation/engine.test.ts` | `distanceScore` distance-decay behavior and radius filtering |
| `recommendation/purchase-intent.test.ts` | **Integration test** — creates a throwaway dealership + anonymous session + consumer profile against the real local Postgres database, exercises `computeIntentScore` against real rows, then tears everything down |
| `validation/inventory.test.ts` | `csvRowSchema` — required fields, enum rejection (no silent coercion), numeric/year range validation, optional fields |
| `validation/leads.test.ts` | `leadFormSchema` — email-or-phone-required refinement, consent-must-be-true |
| `validation/dealer.test.ts` | Dealer application/inventory form schemas |

Most of these are pure-function unit tests with no I/O. The
`purchase-intent.test.ts` file is a genuine integration test and needs a
reachable database — it reads `DATABASE_URL` from `.env.local` via
`vitest.setup.ts`, so run `npm run db:local:setup` (or point `.env.local` at
any Postgres with the migrations applied) before running the suite.

Run a single file: `npx vitest run src/server/pilot/logic.test.ts`

## End-to-end tests (Playwright)

```bash
npm run db:local:setup   # if not already done
npm run db:seed          # e2e tests assume seeded demo data exists
npm run test:e2e
```

16 tests across 4 files in `e2e/`. `playwright.config.ts` starts `npm run
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
| `security.spec.ts` | 6 | Dealer A cannot view Dealer B's lead or inventory by guessing a URL; unauthenticated users are redirected away from `/dealer` and `/admin`; a dealer session cannot reach `/admin`; a consumer session cannot reach `/dealer` or `/admin` |

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
