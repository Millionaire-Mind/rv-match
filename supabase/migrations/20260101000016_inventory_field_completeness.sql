-- Phase 13-14: fills a gap where width_inches, height_inches,
-- hitch_weight_lbs, bed_configuration, and interior already existed as
-- inventory columns and in the CSV/form validation schemas, but were never
-- actually written by createInventory/updateInventory/CSV import - the
-- columns already exist (see 20260101000000_init.sql), this migration only
-- adds the new inventory_source value the generic feed import framework
-- (Phase 14) writes.
alter type inventory_source add value if not exists 'feed_import';
