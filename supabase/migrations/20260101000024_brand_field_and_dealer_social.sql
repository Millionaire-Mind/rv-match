-- Gap-closure pass, Gap 10: inventory field fidelity + dealer-application
-- social-profile URLs.
--
-- "make" (manufacturer, e.g. "Forest River") and "model" have always
-- existed, but "model" has in practice always been populated with the
-- RV's *brand*/product line (e.g. "Rockwood", "Montana", "Jay Flight") -
-- see scripts/seed/catalog.ts and the search filter's own "Rockwood"
-- placeholder on the Model field. There was never a distinct brand
-- column to hold that value, so manufacturer and brand were conflated.
--
-- brand is backfilled from the existing model value for every current
-- row (a safe, honest assumption given the data that's actually been
-- captured so far - no data is lost or invented). Left nullable at the
-- database level - the manual dealer form and CSV/feed validation both
-- require it for every new/updated row going forward (see
-- validation/inventory.ts), but a hard NOT NULL constraint here isn't
-- worth the blast radius across the wide set of direct-insert test
-- fixtures elsewhere in this codebase that predate brand and aren't
-- otherwise part of this gap.
alter table inventory add column if not exists brand text;
update inventory set brand = model where brand is null;

-- Dealer-application social-profile URLs, alongside the existing website
-- field - validated as URLs when present, never mandatory.
alter table dealerships add column if not exists facebook_url text;
alter table dealerships add column if not exists instagram_url text;
