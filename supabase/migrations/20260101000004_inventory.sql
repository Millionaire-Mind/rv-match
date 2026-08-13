-- Inventory and its media/history.

create table inventory (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references dealerships (id) on delete cascade,
  stock_number text not null,
  vin text,
  year integer not null,
  make text not null,
  model text not null,
  floorplan text,
  rv_type rv_type not null,
  condition rv_condition not null default 'used',
  msrp_cents integer,
  sale_price_cents integer not null,
  advertised_price_cents integer,
  length_inches integer,
  width_inches integer,
  height_inches integer,
  dry_weight_lbs integer,
  gvwr_lbs integer,
  hitch_weight_lbs integer,
  sleeps integer,
  slide_count integer default 0,
  bed_configuration text,
  bunkhouse boolean not null default false,
  toy_hauler boolean not null default false,
  outdoor_kitchen boolean not null default false,
  exterior_color text,
  interior text,
  description text,
  city text,
  state text,
  zip_code text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  status inventory_status not null default 'draft',
  source inventory_source not null default 'manual',
  canonical_url text,
  primary_photo_id uuid,
  primary_video_id uuid,
  date_added timestamptz not null default now(),
  date_sold timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealership_id, stock_number)
);

create trigger inventory_set_updated_at
  before update on inventory
  for each row execute function set_updated_at();

create index inventory_dealership_idx on inventory (dealership_id);
create index inventory_status_idx on inventory (status);
create index inventory_rv_type_idx on inventory (rv_type);
create index inventory_price_idx on inventory (sale_price_cents);
create index inventory_published_idx on inventory (status, dealership_id) where status = 'published';

create table inventory_features (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventory (id) on delete cascade,
  feature text not null,
  unique (inventory_id, feature)
);

create index inventory_features_inventory_idx on inventory_features (inventory_id);
create index inventory_features_feature_idx on inventory_features (feature);

create table inventory_photos (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventory (id) on delete cascade,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index inventory_photos_inventory_idx on inventory_photos (inventory_id, position);

create table inventory_videos (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventory (id) on delete cascade,
  url text,
  source video_source not null,
  duration_seconds numeric(6, 2),
  thumbnail_url text,
  caption_url text,
  created_at timestamptz not null default now()
);

create index inventory_videos_inventory_idx on inventory_videos (inventory_id);

alter table inventory
  add constraint inventory_primary_photo_fk foreign key (primary_photo_id)
    references inventory_photos (id) on delete set null,
  add constraint inventory_primary_video_fk foreign key (primary_video_id)
    references inventory_videos (id) on delete set null;

create table inventory_price_history (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventory (id) on delete cascade,
  old_price_cents integer not null,
  new_price_cents integer not null,
  changed_at timestamptz not null default now()
);

create index inventory_price_history_inventory_idx on inventory_price_history (inventory_id, changed_at desc);

create table video_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventory (id) on delete cascade,
  status video_generation_status not null default 'queued',
  attempts integer not null default 0,
  error_message text,
  output_video_id uuid references inventory_videos (id) on delete set null,
  requested_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create trigger video_generation_jobs_set_updated_at
  before update on video_generation_jobs
  for each row execute function set_updated_at();

create index video_generation_jobs_status_idx on video_generation_jobs (status);
create index video_generation_jobs_inventory_idx on video_generation_jobs (inventory_id);
