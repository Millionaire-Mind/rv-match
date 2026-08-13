-- Phase 14: generic inventory feed import framework. A dealer configures a
-- remote CSV/JSON/XML URL plus a field mapping (their feed's field names ->
-- our canonical inventory column names, the same names csv_row_schema
-- already validates against) once, then either runs it on demand or lets
-- scripts/run-feed-import.ts refresh it on a schedule - the same
-- dedicated-worker pattern already used for video generation
-- (scripts/run-video-worker.ts), not an in-process cron hack.
create table if not exists inventory_feed_sources (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  name text not null,
  format text not null check (format in ('csv', 'json', 'xml')),
  url text not null,
  -- Canonical field name (e.g. "stock_number") -> the feed's own field/tag
  -- name (e.g. "StockNum"). Only top-level keys are supported for
  -- JSON/XML - a reasonable scope for a real dealer feed without needing a
  -- full JSONPath/XPath engine.
  field_mapping jsonb not null default '{}',
  -- For JSON/XML, the dot-path to the array of per-vehicle records (e.g.
  -- "vehicles" for {"vehicles":[...]}, or "Inventory.Vehicle" for nested
  -- XML). Ignored for CSV, which is already flat rows.
  record_path text,
  refresh_interval_minutes integer,
  active boolean not null default true,
  last_run_at timestamptz,
  last_run_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_feed_sources_dealership_idx on inventory_feed_sources(dealership_id);

create table if not exists inventory_feed_runs (
  id uuid primary key default gen_random_uuid(),
  feed_source_id uuid not null references inventory_feed_sources(id) on delete cascade,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  rows_processed integer not null default 0,
  rows_created integer not null default 0,
  rows_updated integer not null default 0,
  rows_failed integer not null default 0,
  errors jsonb not null default '[]',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists inventory_feed_runs_source_idx on inventory_feed_runs(feed_source_id, started_at desc);
