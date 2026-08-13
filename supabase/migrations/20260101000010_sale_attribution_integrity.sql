-- Sale attribution integrity (Cursor P0 finding): nothing prevented a
-- double form submit or a retried request from inserting two
-- attributed_sales rows against the same lead. A lead converts to a sale
-- once - cross-unit sales (the consumer bought a different RV than the one
-- they originally inquired about) are represented on that single row via
-- sold_inventory_id / is_original_lead_rv, not by a second row.
--
-- This does not restrict which inventory unit a lead's sale can reference
-- (cross-unit sales remain fully supported), only that a given lead can
-- have at most one attributed sale record.
alter table attributed_sales
  add constraint attributed_sales_lead_id_unique unique (lead_id);
