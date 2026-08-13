-- Swipe decisions, saves, raw behavioral events, and the learned
-- preference vector the recommendation engine reads/writes.

create table swipe_decisions (
  id uuid primary key default gen_random_uuid(),
  consumer_profile_id uuid not null references consumer_profiles (id) on delete cascade,
  inventory_id uuid not null references inventory (id) on delete cascade,
  decision swipe_decision_type not null,
  swipe_duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consumer_profile_id, inventory_id)
);

create trigger swipe_decisions_set_updated_at
  before update on swipe_decisions
  for each row execute function set_updated_at();

create index swipe_decisions_consumer_idx on swipe_decisions (consumer_profile_id, created_at desc);
create index swipe_decisions_inventory_idx on swipe_decisions (inventory_id);

create table saved_inventory (
  id uuid primary key default gen_random_uuid(),
  consumer_profile_id uuid not null references consumer_profiles (id) on delete cascade,
  inventory_id uuid not null references inventory (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (consumer_profile_id, inventory_id)
);

create index saved_inventory_consumer_idx on saved_inventory (consumer_profile_id, created_at desc);

-- event_type is intentionally a checked text column (not an enum) so new
-- event types can be added without a blocking migration.
create table behavioral_events (
  id uuid primary key default gen_random_uuid(),
  consumer_profile_id uuid references consumer_profiles (id) on delete cascade,
  event_type text not null check (event_type in (
    'page_view', 'discovery_started',
    'video_started', 'video_25', 'video_50', 'video_75', 'video_complete', 'video_replayed',
    'pass', 'like', 'love', 'more_like_this',
    'save', 'unsave', 'detail_view',
    'location_added', 'match_completed',
    'lead_started', 'lead_submitted',
    'dealer_view', 'account_created'
  )),
  inventory_id uuid references inventory (id) on delete cascade,
  dealership_id uuid references dealerships (id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index behavioral_events_consumer_idx on behavioral_events (consumer_profile_id, created_at desc);
create index behavioral_events_type_idx on behavioral_events (event_type);
create index behavioral_events_inventory_idx on behavioral_events (inventory_id);
create index behavioral_events_dealership_idx on behavioral_events (dealership_id);

-- One row per (consumer, attribute, value) learned preference signal, e.g.
-- attribute='rv_type', value='travel_trailer', score=0.82. Written by the
-- recommendation engine using weights from admin_configuration.
create table consumer_preferences (
  id uuid primary key default gen_random_uuid(),
  consumer_profile_id uuid not null references consumer_profiles (id) on delete cascade,
  attribute text not null,
  value text not null,
  score numeric(6, 4) not null default 0,
  observations integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (consumer_profile_id, attribute, value)
);

create index consumer_preferences_consumer_idx on consumer_preferences (consumer_profile_id);
