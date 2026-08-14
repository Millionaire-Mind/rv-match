-- Phase 23: consumer-facing data rights (data export is read-only and
-- needs no schema support - see src/app/api/account/export/route.ts).
-- Deletion is request-based rather than instant self-service because a
-- consumer_profiles row can be referenced by a dealer's own business
-- records (leads.consumer_profile_id) that a dealer has a legitimate
-- reason to retain - an admin actions the request rather than a shopper
-- being able to unilaterally erase data a dealer still needs.
create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately set null (not cascaded) on the profile's actual deletion,
  -- so the request row survives as an audit record of "requested on X,
  -- fulfilled on Y" even after the underlying profile is gone.
  consumer_profile_id uuid references consumer_profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references profiles(id) on delete set null
);

create index if not exists account_deletion_requests_pending_idx
  on account_deletion_requests(requested_at) where status = 'pending';

-- Defaults to opted-in (false = not opted out) to preserve the existing
-- always-attempt-email behavior from Phase 20-21 for every profile that
-- already exists; this is the toggle that actually lets a consumer turn
-- it off going forward.
alter table consumer_profiles add column if not exists email_opt_out boolean not null default false;
