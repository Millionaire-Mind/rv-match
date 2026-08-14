-- Gap-closure pass, Gap 4: salesperson-attributed referral codes and full
-- UTM/acquisition-source capture for first-touch attribution.

-- A dealer staff member (owner/sales_manager/salesperson) can have their
-- own personal referral code, distinct from a dealer-general or
-- per-RV-QR campaign. Nullable and independent of creator_id (a campaign
-- is either salesperson-attributed or creator-attributed, never both, but
-- that's an application-level invariant, not worth a check constraint
-- given creator_id is also nullable for every other campaign type).
alter table distribution_campaigns add column if not exists salesperson_user_id uuid references profiles(id) on delete set null;
create index if not exists distribution_campaigns_salesperson_idx on distribution_campaigns(salesperson_user_id);

alter table distribution_campaigns drop constraint if exists distribution_campaigns_campaign_type_check;
alter table distribution_campaigns add constraint distribution_campaigns_campaign_type_check check (
  campaign_type in ('dealer_general', 'dealer_inventory', 'creator', 'salesperson')
);

-- Raw UTM parameters, captured once at an anonymous session's first
-- creation (same immutable-first-touch contract as first_source/
-- first_campaign_id - never overwritten by a later visit). Kept alongside
-- the classified first_source so admin/dealer views can show the exact
-- tag a marketer used, not just the bucket it was classified into.
alter table anonymous_sessions add column if not exists utm_source text;
alter table anonymous_sessions add column if not exists utm_medium text;
alter table anonymous_sessions add column if not exists utm_campaign text;
alter table anonymous_sessions add column if not exists utm_content text;
alter table anonymous_sessions add column if not exists utm_term text;

-- Frozen (never re-derived) salesperson attribution, mirroring how
-- first_source/first_campaign_id are already frozen onto leads and sales
-- at their own creation time - see leads/actions.ts and
-- dealer/lead-actions.ts's markLeadSold.
alter table leads add column if not exists first_salesperson_user_id uuid references profiles(id) on delete set null;
alter table attributed_sales add column if not exists first_salesperson_user_id uuid references profiles(id) on delete set null;
