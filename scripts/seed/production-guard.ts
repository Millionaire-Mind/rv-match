/**
 * Pure decision logic for whether scripts/seed/index.ts should refuse to
 * run, extracted so it's unit-testable without needing a live DB connection
 * (index.ts opens one at module load). See index.ts's
 * refuseIfLooksLikeRealDeployment for why this exists: the seed script
 * creates a platform admin with a password published in README.md, a
 * synthetic verified sale, and other clearly-fake demo data, so it must
 * never run unattended against what looks like a real deployment.
 */
export type SeedGuardEnv = Record<string, string | undefined>;

export interface SeedGuardResult {
  refuse: boolean;
  reason?: string;
}

const FORCE_FLAG = "--yes-seed-real-database";

export function evaluateSeedGuard(env: SeedGuardEnv, argv: string[]): SeedGuardResult {
  if (argv.includes(FORCE_FLAG)) return { refuse: false };

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const looksLikeRealSupabase = Boolean(supabaseUrl) && !supabaseUrl.includes("your-project");
  const dbUrl = env.DATABASE_URL ?? "";
  const looksLikeLocalDb = /localhost|127\.0\.0\.1/.test(dbUrl);

  if (looksLikeRealSupabase || !looksLikeLocalDb) {
    return {
      refuse: true,
      reason: [
        "REFUSING TO SEED: this does not look like a local development database.",
        `  NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl || "(unset)"}`,
        `  DATABASE_URL host=${dbUrl.replace(/:\/\/[^@]*@/, "://<redacted>@") || "(unset)"}`,
        "",
        "This script creates a platform admin account with a password",
        "published in README.md, a synthetic verified sale, and other",
        "clearly-fake demo data. Running it against a real deployment would",
        "create a real, publicly-known-password admin account and corrupt",
        "live dashboards with fake revenue.",
        "",
        "If this genuinely is a disposable/staging project you want demo",
        `data in, re-run with: npm run db:seed -- ${FORCE_FLAG}`,
      ].join("\n"),
    };
  }

  return { refuse: false };
}
