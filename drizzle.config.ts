import type { Config } from "drizzle-kit";

export default {
  schema: "./src/server/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/rvmatch_test",
  },
  // We hand-author SQL migrations (supabase/migrations/*.sql) as the source
  // of truth so RLS/triggers/functions are reviewable plain SQL. drizzle-kit
  // is used here only for `drizzle-kit check`/introspection during
  // development, not for generating migrations.
} satisfies Config;
