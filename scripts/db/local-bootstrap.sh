#!/usr/bin/env bash
# Creates (if missing) a local Postgres database for RV Match development,
# applies the local-dev-only auth stub, then applies all real migrations.
# Requires a running local Postgres reachable with the given connection
# details (defaults match .env.example). See README.md "Local setup
# without Supabase" for how to install/start Postgres.
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
DBNAME="${1:-rvmatch_dev}"

export PGPASSWORD

DB_EXISTS=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -tAc "select 1 from pg_database where datname='${DBNAME}'")
if [ "$DB_EXISTS" != "1" ]; then
  echo "Creating database ${DBNAME}..."
  createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DBNAME"
else
  echo "Database ${DBNAME} already exists."
fi

echo "Applying local auth stub..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/../local-dev/supabase-stub.sql"

echo "Applying migrations..."
DATABASE_URL="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${DBNAME}" npx tsx "$(dirname "$0")/migrate.ts"

echo "Done. DATABASE_URL=postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${DBNAME}"
