-- Gap-closure pass, Gap 6: billing-ready plan schema ONLY.
--
-- No Stripe integration, no checkout flow, no payment collection is
-- introduced by this migration or anywhere else in this pass. This adds a
-- durable data shape a future billing integration can populate -
-- application code in this repository never writes a non-default value
-- into these columns.

create type dealer_plan as enum ('founding_pilot', 'standard', 'premium');
create type billing_provider as enum ('none', 'stripe');
create type billing_status as enum ('none', 'trialing', 'active', 'past_due', 'canceled');

-- Extends dealer_pilots (already the one durable per-dealership
-- plan/status record - see started_at/trial_days/status) rather than
-- introducing a second 1:1 table for the same dealership. founding-pilot
-- status itself is already tracked by the existing pilot_status column;
-- these additions are the surrounding billing shape it currently has no
-- home in.
alter table dealer_pilots add column if not exists plan dealer_plan not null default 'founding_pilot';
alter table dealer_pilots add column if not exists billing_provider billing_provider not null default 'none';
alter table dealer_pilots add column if not exists billing_status billing_status not null default 'none';
alter table dealer_pilots add column if not exists external_customer_id text;
alter table dealer_pilots add column if not exists external_subscription_id text;
-- Trial start is already started_at. conversion_due_at/activated_at/
-- canceled_at are new: the pilot_status enum already has a
-- 'conversion_due' value, but not *when* it became due, and there was
-- previously no field at all for a paid-plan activation or cancellation
-- timestamp.
alter table dealer_pilots add column if not exists conversion_due_at timestamptz;
alter table dealer_pilots add column if not exists activated_at timestamptz;
alter table dealer_pilots add column if not exists canceled_at timestamptz;

comment on column dealer_pilots.plan is 'Billing-ready data architecture; payment processing not enabled.';
comment on column dealer_pilots.billing_provider is 'Billing-ready data architecture; payment processing not enabled.';
comment on column dealer_pilots.billing_status is 'Billing-ready data architecture; payment processing not enabled.';
comment on column dealer_pilots.external_customer_id is 'Billing-ready data architecture; payment processing not enabled. Populated by a future payment-provider integration only.';
comment on column dealer_pilots.external_subscription_id is 'Billing-ready data architecture; payment processing not enabled. Populated by a future payment-provider integration only.';
