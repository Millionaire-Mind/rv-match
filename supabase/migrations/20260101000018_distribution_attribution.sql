-- Phase 17-19: distribution/QR center, durable first-touch attribution, and
-- a lightweight creator referral system (no payments - just identity +
-- campaign association, matching the master prompt's explicit exclusion).

create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- A single "campaign" record backs every kind of shareable link: a QR code
-- on a dealership's lot, a QR sticker on one specific RV's window, a
-- generic dealer link, or a creator/influencer's referral link. All of
-- them resolve through /go/{code}.
create table if not exists distribution_campaigns (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid references dealerships(id) on delete cascade,
  inventory_id uuid references inventory(id) on delete cascade,
  creator_id uuid references creators(id) on delete set null,
  code text not null unique,
  name text not null,
  campaign_type text not null check (campaign_type in ('dealer_general', 'dealer_inventory', 'creator')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint distribution_campaigns_inventory_requires_dealership check (
    inventory_id is null or dealership_id is not null
  )
);

create index if not exists distribution_campaigns_dealership_idx on distribution_campaigns(dealership_id);
create index if not exists distribution_campaigns_creator_idx on distribution_campaigns(creator_id);

-- First-touch attribution: which campaign (if any) first brought this
-- browser to the site. Set once, at first anonymous_sessions creation
-- (see src/app/go/[code]/route.ts) - never overwritten by a later visit
-- through a different link, the same "first touch persists" contract the
-- master prompt requires.
alter table anonymous_sessions add column if not exists first_campaign_id uuid references distribution_campaigns(id) on delete set null;

-- Leads and sales durably inherit the attribution that was live at their
-- own creation time (a frozen copy, same philosophy as leads.behavior_snapshot
-- from Phase 1) rather than re-deriving it later, so a lead's recorded
-- attribution never silently changes even if distribution_campaigns rows
-- are edited afterward.
alter table leads add column if not exists first_source text;
alter table leads add column if not exists first_campaign_id uuid references distribution_campaigns(id) on delete set null;
alter table attributed_sales add column if not exists first_source text;
alter table attributed_sales add column if not exists first_campaign_id uuid references distribution_campaigns(id) on delete set null;

alter table behavioral_events drop constraint behavioral_events_event_type_check;
alter table behavioral_events add constraint behavioral_events_event_type_check check (event_type in (
  'page_view', 'discovery_started',
  'video_started', 'video_25', 'video_50', 'video_75', 'video_complete', 'video_replayed',
  'video_paused', 'video_muted', 'video_unmuted',
  'pass', 'like', 'love', 'more_like_this',
  'save', 'unsave', 'detail_view',
  'location_added', 'match_completed',
  'lead_started', 'lead_submitted',
  'dealer_view', 'account_created',
  'search_performed', 'show_me_similar',
  'partner_invite_created', 'partner_joined', 'shared_match_viewed',
  'call_dealer_clicked',
  'campaign_scan'
));
