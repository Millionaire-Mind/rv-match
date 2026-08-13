-- Phase 9: couples/partner matching ("Compare With My Partner"). An invite
-- link connects two consumer_profiles (each keeps its own independent
-- preference history - nothing here merges or overwrites either profile),
-- so a shared match view can later score both and surface overlap.
create table if not exists partner_links (
  id uuid primary key default gen_random_uuid(),
  owner_consumer_profile_id uuid not null references consumer_profiles(id) on delete cascade,
  partner_consumer_profile_id uuid references consumer_profiles(id) on delete set null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'joined')),
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  constraint partner_links_distinct_parties check (
    partner_consumer_profile_id is null or partner_consumer_profile_id != owner_consumer_profile_id
  )
);

create index if not exists partner_links_owner_idx on partner_links(owner_consumer_profile_id);
create index if not exists partner_links_partner_idx on partner_links(partner_consumer_profile_id);

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
  'partner_invite_created', 'partner_joined', 'shared_match_viewed'
));
