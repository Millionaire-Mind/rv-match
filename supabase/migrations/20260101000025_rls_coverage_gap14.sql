-- Gap 14 (live Supabase readiness re-check): partner_links,
-- inventory_feed_sources, inventory_feed_runs, creators,
-- distribution_campaigns, notifications, and account_deletion_requests
-- were all added in later phases (9, 14, 17-19, 20-21, 23) after the
-- original RLS pass (20260101000008) and were never brought under RLS.
-- The app itself always connects with a direct DATABASE_URL connection
-- (src/server/db/client.ts), which bypasses RLS entirely, so this was
-- never an app-facing bug - but per the same defense-in-depth rationale
-- documented in 20260101000008_rls_policies.sql, any of these tables
-- reachable by a raw user JWT via supabase-js/PostgREST was left wide
-- open. This closes that gap with the same ownership patterns already
-- established for every other table.

alter table partner_links enable row level security;
alter table inventory_feed_sources enable row level security;
alter table inventory_feed_runs enable row level security;
alter table creators enable row level security;
alter table distribution_campaigns enable row level security;
alter table notifications enable row level security;
alter table account_deletion_requests enable row level security;

-- partner_links: only the two consumers on either side of the invite can
-- see it. No client write policy - links are created/joined server-side.
create policy partner_links_select_party on partner_links
  for select using (
    is_platform_admin() or
    owner_consumer_profile_id in (select id from consumer_profiles where user_id = auth.uid()) or
    partner_consumer_profile_id in (select id from consumer_profiles where user_id = auth.uid())
  );

-- inventory_feed_sources: a dealer configures and manages their own feed
-- source in the dealer UI, so this mirrors inventory_dealer_write.
create policy inventory_feed_sources_select on inventory_feed_sources
  for select using (is_dealership_member(dealership_id) or is_platform_admin());
create policy inventory_feed_sources_dealer_write on inventory_feed_sources
  for all using (is_dealership_member(dealership_id) or is_platform_admin())
  with check (is_dealership_member(dealership_id) or is_platform_admin());

-- inventory_feed_runs: worker-generated audit log of each import run - a
-- dealer can view their own feed's run history but never write it
-- directly, mirroring the video_generation_jobs status flow.
create policy inventory_feed_runs_select on inventory_feed_runs
  for select using (
    is_platform_admin() or
    is_dealership_member((select dealership_id from inventory_feed_sources where id = feed_source_id))
  );

-- creators: platform-admin-managed roster, no dealer or consumer relation.
create policy creators_admin_only on creators
  for all using (is_platform_admin()) with check (is_platform_admin());

-- distribution_campaigns: a dealer manages their own dealership's
-- campaigns (dealer_general/dealer_inventory); creator campaigns
-- (dealership_id null) are admin-only, matching the existing
-- dealership-null-means-platform-owned pattern used elsewhere.
create policy distribution_campaigns_select on distribution_campaigns
  for select using (
    is_platform_admin() or (dealership_id is not null and is_dealership_member(dealership_id))
  );
create policy distribution_campaigns_dealer_write on distribution_campaigns
  for all using (
    is_platform_admin() or (dealership_id is not null and is_dealership_member(dealership_id))
  ) with check (
    is_platform_admin() or (dealership_id is not null and is_dealership_member(dealership_id))
  );

-- notifications: a consumer or dealer user can see and mark-read only
-- their own notifications; admin sees all. No insert policy - all
-- notifications are system-generated server-side.
create policy notifications_select_own on notifications
  for select using (
    is_platform_admin() or
    (consumer_profile_id in (select id from consumer_profiles where user_id = auth.uid())) or
    (user_id = auth.uid())
  );
create policy notifications_update_own on notifications
  for update using (
    is_platform_admin() or
    (consumer_profile_id in (select id from consumer_profiles where user_id = auth.uid())) or
    (user_id = auth.uid())
  ) with check (
    is_platform_admin() or
    (consumer_profile_id in (select id from consumer_profiles where user_id = auth.uid())) or
    (user_id = auth.uid())
  );

-- account_deletion_requests: an admin actions these (see the Phase 23
-- comment on the table's own migration for why deletion is request-based
-- rather than self-service); no consumer read/write policy needed since
-- consumers never query this table directly - the account page just
-- shows request status via a server action using the service connection.
create policy account_deletion_requests_admin_only on account_deletion_requests
  for all using (is_platform_admin()) with check (is_platform_admin());
