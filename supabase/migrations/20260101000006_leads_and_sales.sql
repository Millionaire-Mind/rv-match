-- Leads, their pipeline activity, and attributable sales.

create table leads (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references dealerships (id) on delete cascade,
  inventory_id uuid not null references inventory (id) on delete restrict,
  consumer_profile_id uuid references consumer_profiles (id) on delete set null,
  name text not null,
  email text,
  phone text,
  preferred_contact preferred_contact_method not null default 'email',
  message text,
  cta_type lead_cta_type not null,
  consent boolean not null default true,
  match_score numeric(5, 2),
  intent_score numeric(5, 2),
  intent_reasons jsonb not null default '[]'::jsonb,
  behavior_snapshot jsonb not null default '{}'::jsonb,
  status lead_status not null default 'new',
  assigned_to uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_contact_chk check (email is not null or phone is not null)
);

create trigger leads_set_updated_at
  before update on leads
  for each row execute function set_updated_at();

create index leads_dealership_idx on leads (dealership_id, created_at desc);
create index leads_inventory_idx on leads (inventory_id);
create index leads_consumer_idx on leads (consumer_profile_id);
create index leads_status_idx on leads (dealership_id, status);

create table lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  actor_id uuid references profiles (id) on delete set null,
  activity_type lead_activity_type not null,
  from_status lead_status,
  to_status lead_status,
  note text,
  created_at timestamptz not null default now()
);

create index lead_activity_lead_idx on lead_activity (lead_id, created_at desc);

create table attributed_sales (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  dealership_id uuid not null references dealerships (id) on delete cascade,
  sold_inventory_id uuid not null references inventory (id) on delete restrict,
  is_original_lead_rv boolean not null default true,
  sale_price_cents integer,
  sale_date date not null,
  salesperson_id uuid references profiles (id) on delete set null,
  notes text,
  verification_status sale_verification_status not null default 'dealer_reported',
  verified_by uuid references profiles (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger attributed_sales_set_updated_at
  before update on attributed_sales
  for each row execute function set_updated_at();

create index attributed_sales_dealership_idx on attributed_sales (dealership_id);
create index attributed_sales_lead_idx on attributed_sales (lead_id);
create index attributed_sales_verification_idx on attributed_sales (dealership_id, verification_status);
