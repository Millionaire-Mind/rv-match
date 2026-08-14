-- Gap-closure pass, Gap 7: CSV/feed import warnings channel - a non-fatal
-- warning class distinct from the fatal errors a row is already rejected
-- for. inventory_feed_runs already tracked rows_failed/errors; this adds
-- the equivalent non-fatal counterpart so a feed run's results can
-- distinguish "row imported cleanly" from "row imported but worth a
-- second look" from "row rejected outright."

alter table inventory_feed_runs add column if not exists rows_with_warnings integer not null default 0;
alter table inventory_feed_runs add column if not exists warnings jsonb not null default '[]'::jsonb;
