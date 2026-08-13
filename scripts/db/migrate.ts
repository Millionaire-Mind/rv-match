/**
 * Applies every *.sql file under a given directory, in filename order,
 * tracking what has already run in a `schema_migrations` table so this is
 * safe to re-run. Used for both the local dev database and CI/test
 * databases. Real Supabase projects should prefer `supabase db push`
 * (documented in README.md); this script is a portable fallback that works
 * against any plain Postgres 15+ connection string.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const dir = process.argv[2] ?? path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const sql = postgres(connectionString, { max: 1 });

  await sql`create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`;

  const appliedRows = await sql<{ filename: string }[]>`select filename from schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.filename));

  let ranCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const contents = readFileSync(path.join(dir, file), "utf8");
    console.log(`Applying ${file}...`);
    await sql.unsafe(contents);
    await sql`insert into schema_migrations (filename) values (${file})`;
    ranCount += 1;
  }

  console.log(
    ranCount === 0
      ? "No new migrations to apply."
      : `Applied ${ranCount} migration file(s) from ${dir}.`,
  );

  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
