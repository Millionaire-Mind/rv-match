import { describe, expect, it } from "vitest";

import { evaluateSeedGuard } from "./production-guard";

describe("evaluateSeedGuard", () => {
  it("allows seeding a local Postgres database with no Supabase configured", () => {
    const result = evaluateSeedGuard(
      { DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rvmatch_dev" },
      [],
    );
    expect(result.refuse).toBe(false);
  });

  it("allows seeding a local Postgres database on 127.0.0.1", () => {
    const result = evaluateSeedGuard({ DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/rvmatch_dev" }, []);
    expect(result.refuse).toBe(false);
  });

  it("refuses when NEXT_PUBLIC_SUPABASE_URL points at a real-looking project", () => {
    const result = evaluateSeedGuard(
      {
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rvmatch_dev",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghij.supabase.co",
      },
      [],
    );
    expect(result.refuse).toBe(true);
    expect(result.reason).toContain("REFUSING TO SEED");
  });

  it("allows the local-provider placeholder Supabase URL", () => {
    const result = evaluateSeedGuard(
      {
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rvmatch_dev",
        NEXT_PUBLIC_SUPABASE_URL: "https://your-project.supabase.co",
      },
      [],
    );
    expect(result.refuse).toBe(false);
  });

  it("refuses when DATABASE_URL doesn't look local, even without Supabase configured", () => {
    const result = evaluateSeedGuard(
      { DATABASE_URL: "postgres://user:pass@db.some-production-host.com:5432/rvmatch" },
      [],
    );
    expect(result.refuse).toBe(true);
  });

  it("refuses when DATABASE_URL is entirely unset", () => {
    const result = evaluateSeedGuard({}, []);
    expect(result.refuse).toBe(true);
  });

  it("is overridable with the explicit --yes-seed-real-database flag", () => {
    const result = evaluateSeedGuard(
      {
        DATABASE_URL: "postgres://user:pass@db.some-production-host.com:5432/rvmatch",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghij.supabase.co",
      },
      ["--yes-seed-real-database"],
    );
    expect(result.refuse).toBe(false);
  });

  it("redacts credentials from the DATABASE_URL host shown in the refusal message", () => {
    const result = evaluateSeedGuard(
      { DATABASE_URL: "postgres://someuser:supersecretpassword@prod-db.example.com:5432/rvmatch" },
      [],
    );
    expect(result.reason).not.toContain("supersecretpassword");
  });
});
