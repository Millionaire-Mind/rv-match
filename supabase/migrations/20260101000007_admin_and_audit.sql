-- Admin-tunable configuration (recommendation weights, intent weights,
-- pilot defaults, exploration rate) and the audit log for sensitive
-- dealer/admin actions.

create table admin_configuration (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id) on delete set null
);

create trigger admin_configuration_set_updated_at
  before update on admin_configuration
  for each row execute function set_updated_at();

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  dealership_id uuid references dealerships (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_dealership_idx on audit_logs (dealership_id, created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);

-- Seed default configuration. Values are read at request time by the
-- recommendation/intent engines and are editable from /admin/config —
-- never hardcoded in application code.
insert into admin_configuration (key, value) values
  ('recommendation_weights', '{
    "pass": -1.0,
    "like": 1.0,
    "love": 2.0,
    "more_like_this": 3.0,
    "video_complete": 0.4,
    "video_replayed": 0.6,
    "save": 1.5,
    "detail_view": 0.8,
    "fast_swipe_penalty": -0.3,
    "fast_swipe_threshold_ms": 600,
    "explorationRate": 0.15,
    "priceAffinitySigma": 0.35,
    "distanceDecayMiles": 60
  }'::jsonb),
  ('intent_weights', '{
    "availability_request": 35,
    "appointment_request": 40,
    "trade_interest": 12,
    "financing_interest": 10,
    "save": 6,
    "dealer_view": 8,
    "detail_view": 4,
    "repeat_session": 8,
    "video_complete": 3,
    "proximityBonusMax": 10,
    "proximityBonusMiles": 30
  }'::jsonb),
  ('pilot_defaults', '{
    "trial_days": 90,
    "sales_threshold": 3
  }'::jsonb),
  ('platform', '{
    "activationThreshold": 10,
    "matchCompleteThreshold": 20,
    "locationPromptThreshold": 10
  }'::jsonb)
on conflict (key) do nothing;
