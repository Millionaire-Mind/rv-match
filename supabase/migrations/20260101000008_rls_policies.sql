-- Row Level Security. This is defense-in-depth: the application's server
-- actions additionally enforce tenant isolation at the application layer
-- (requireDealerRole/requireAdmin) before ever issuing a query, because the
-- app never exposes PostgREST to the browser — all consumer/dealer/admin
-- reads and writes go through Next.js server actions. RLS still matters
-- for anyone hitting Supabase directly with a user's JWT (e.g. the
-- supabase-js client, future mobile clients, or a misconfigured route),
-- which is exactly the "URL manipulation / API call" attack the product
-- spec requires this to withstand.

create or replace function is_platform_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and platform_role = 'platform_admin'
  );
$$;

create or replace function is_dealership_member(target_dealership_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from dealership_users
    where dealership_id = target_dealership_id and user_id = auth.uid()
  );
$$;

alter table profiles enable row level security;
alter table anonymous_sessions enable row level security;
alter table consumer_profiles enable row level security;
alter table dealerships enable row level security;
alter table dealership_users enable row level security;
alter table dealer_pilots enable row level security;
alter table inventory enable row level security;
alter table inventory_features enable row level security;
alter table inventory_photos enable row level security;
alter table inventory_videos enable row level security;
alter table inventory_price_history enable row level security;
alter table video_generation_jobs enable row level security;
alter table swipe_decisions enable row level security;
alter table saved_inventory enable row level security;
alter table behavioral_events enable row level security;
alter table consumer_preferences enable row level security;
alter table leads enable row level security;
alter table lead_activity enable row level security;
alter table attributed_sales enable row level security;
alter table admin_configuration enable row level security;
alter table audit_logs enable row level security;

-- profiles
create policy profiles_select_own_or_admin on profiles
  for select using (id = auth.uid() or is_platform_admin());
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- dealerships: members see their own dealership; admins see all.
create policy dealerships_select on dealerships
  for select using (is_dealership_member(id) or is_platform_admin());
create policy dealerships_update on dealerships
  for update using (is_platform_admin() or is_dealership_member(id) and status = 'approved')
  with check (is_platform_admin() or is_dealership_member(id));
create policy dealerships_admin_insert on dealerships
  for insert with check (is_platform_admin());

-- dealership_users: members can see co-workers at their own dealership.
create policy dealership_users_select on dealership_users
  for select using (is_dealership_member(dealership_id) or is_platform_admin());
create policy dealership_users_admin_write on dealership_users
  for all using (is_platform_admin()) with check (is_platform_admin());

-- dealer_pilots: dealer members (read-only) + admin (full).
create policy dealer_pilots_select on dealer_pilots
  for select using (is_dealership_member(dealership_id) or is_platform_admin());
create policy dealer_pilots_admin_write on dealer_pilots
  for all using (is_platform_admin()) with check (is_platform_admin());

-- inventory: dealership members manage their own inventory; everyone
-- (including anonymous, via the anon key) can read published inventory —
-- required for the consumer discovery feed to work even for a signed-out
-- browser using the public anon key.
create policy inventory_select_published on inventory
  for select using (status = 'published' or is_dealership_member(dealership_id) or is_platform_admin());
create policy inventory_dealer_write on inventory
  for all using (is_dealership_member(dealership_id) or is_platform_admin())
  with check (is_dealership_member(dealership_id) or is_platform_admin());

create policy inventory_features_select on inventory_features
  for select using (true);
create policy inventory_features_dealer_write on inventory_features
  for all using (
    is_platform_admin() or is_dealership_member((select dealership_id from inventory where id = inventory_id))
  ) with check (
    is_platform_admin() or is_dealership_member((select dealership_id from inventory where id = inventory_id))
  );

create policy inventory_photos_select on inventory_photos for select using (true);
create policy inventory_photos_dealer_write on inventory_photos
  for all using (
    is_platform_admin() or is_dealership_member((select dealership_id from inventory where id = inventory_id))
  ) with check (
    is_platform_admin() or is_dealership_member((select dealership_id from inventory where id = inventory_id))
  );

create policy inventory_videos_select on inventory_videos for select using (true);
create policy inventory_videos_dealer_write on inventory_videos
  for all using (
    is_platform_admin() or is_dealership_member((select dealership_id from inventory where id = inventory_id))
  ) with check (
    is_platform_admin() or is_dealership_member((select dealership_id from inventory where id = inventory_id))
  );

create policy inventory_price_history_select on inventory_price_history
  for select using (
    is_platform_admin() or is_dealership_member((select dealership_id from inventory where id = inventory_id))
  );

create policy video_generation_jobs_select on video_generation_jobs
  for select using (
    is_platform_admin() or is_dealership_member((select dealership_id from inventory where id = inventory_id))
  );
create policy video_generation_jobs_dealer_write on video_generation_jobs
  for insert with check (
    is_platform_admin() or is_dealership_member((select dealership_id from inventory where id = inventory_id))
  );

-- consumer_profiles / behavioral data: a signed-in consumer can see only
-- their own identity's rows; anonymous read/write happens server-side via
-- the service role (anonymous shoppers hold no Supabase JWT at all).
create policy consumer_profiles_select_own on consumer_profiles
  for select using (user_id = auth.uid() or is_platform_admin());

create policy swipe_decisions_select_own on swipe_decisions
  for select using (
    is_platform_admin() or
    consumer_profile_id in (select id from consumer_profiles where user_id = auth.uid())
  );

create policy saved_inventory_select_own on saved_inventory
  for select using (
    is_platform_admin() or
    consumer_profile_id in (select id from consumer_profiles where user_id = auth.uid())
  );

create policy behavioral_events_select_own on behavioral_events
  for select using (
    is_platform_admin() or
    consumer_profile_id in (select id from consumer_profiles where user_id = auth.uid())
  );

create policy consumer_preferences_select_own on consumer_preferences
  for select using (
    is_platform_admin() or
    consumer_profile_id in (select id from consumer_profiles where user_id = auth.uid())
  );

-- leads: only the owning dealership's members (and admin) may read; a
-- consumer cannot read leads at all through this policy set (leads are
-- written server-side, not read back client-side by consumers).
create policy leads_select on leads
  for select using (is_dealership_member(dealership_id) or is_platform_admin());
create policy leads_dealer_update on leads
  for update using (is_dealership_member(dealership_id) or is_platform_admin())
  with check (is_dealership_member(dealership_id) or is_platform_admin());

create policy lead_activity_select on lead_activity
  for select using (
    is_platform_admin() or
    is_dealership_member((select dealership_id from leads where id = lead_id))
  );
create policy lead_activity_dealer_insert on lead_activity
  for insert with check (
    is_platform_admin() or
    is_dealership_member((select dealership_id from leads where id = lead_id))
  );

create policy attributed_sales_select on attributed_sales
  for select using (is_dealership_member(dealership_id) or is_platform_admin());
create policy attributed_sales_dealer_insert on attributed_sales
  for insert with check (is_dealership_member(dealership_id) or is_platform_admin());
create policy attributed_sales_admin_update on attributed_sales
  for update using (is_platform_admin()) with check (is_platform_admin());

-- admin-only tables
create policy admin_configuration_select on admin_configuration
  for select using (is_platform_admin());
create policy admin_configuration_write on admin_configuration
  for all using (is_platform_admin()) with check (is_platform_admin());

create policy audit_logs_select on audit_logs
  for select using (
    is_platform_admin() or (dealership_id is not null and is_dealership_member(dealership_id))
  );
