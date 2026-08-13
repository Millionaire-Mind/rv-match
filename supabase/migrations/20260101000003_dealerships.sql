-- Dealerships, dealer employees, and founding-dealer pilot tracking.

create table dealerships (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address_line1 text,
  city text,
  state text,
  zip_code text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  phone text,
  website text,
  primary_contact_name text not null,
  primary_contact_email text not null,
  inventory_size_estimate integer,
  status dealership_status not null default 'pending',
  applied_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dealerships_set_updated_at
  before update on dealerships
  for each row execute function set_updated_at();

create index dealerships_status_idx on dealerships (status);

create table dealership_users (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references dealerships (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role dealer_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (dealership_id, user_id)
);

create index dealership_users_user_idx on dealership_users (user_id);
create index dealership_users_dealership_idx on dealership_users (dealership_id);

-- Founding Dealer pilot: free for `trial_days` days OR `sales_threshold`
-- verified attributable sales, whichever occurs first. Defaults are
-- platform-configurable (see admin_configuration) and overrideable per
-- dealer here.
create table dealer_pilots (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null unique references dealerships (id) on delete cascade,
  started_at timestamptz not null default now(),
  trial_days integer not null default 90,
  sales_threshold integer not null default 3,
  verified_sales_count integer not null default 0,
  status pilot_status not null default 'pending',
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dealer_pilots_set_updated_at
  before update on dealer_pilots
  for each row execute function set_updated_at();
