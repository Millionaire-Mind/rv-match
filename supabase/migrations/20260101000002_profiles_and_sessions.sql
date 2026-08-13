-- Profiles (one row per Supabase auth user), anonymous sessions, and the
-- unified "consumer_profiles" shopper identity that both can map to.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  platform_role platform_role not null default 'consumer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile row whenever a Supabase auth user is created.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

create table anonymous_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  merged_into_user_id uuid references profiles (id) on delete set null,
  user_agent text,
  first_source text default 'direct'
);

create index anonymous_sessions_merged_idx on anonymous_sessions (merged_into_user_id);

-- The stable "shopper identity" every behavioral row hangs off of, whether
-- the shopper is anonymous or signed in. Exactly one of user_id /
-- anonymous_session_id must be set. On signup, an existing anonymous
-- consumer_profiles row is *reused* (user_id gets attached) rather than
-- creating a second identity — that is the anonymous -> account merge.
create table consumer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references profiles (id) on delete cascade,
  anonymous_session_id uuid unique references anonymous_sessions (id) on delete set null,
  zip_code text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  radius_miles integer not null default 100,
  decisions_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumer_profiles_identity_chk check (
    user_id is not null or anonymous_session_id is not null
  )
);

create trigger consumer_profiles_set_updated_at
  before update on consumer_profiles
  for each row execute function set_updated_at();

create index consumer_profiles_user_idx on consumer_profiles (user_id);
create index consumer_profiles_session_idx on consumer_profiles (anonymous_session_id);
