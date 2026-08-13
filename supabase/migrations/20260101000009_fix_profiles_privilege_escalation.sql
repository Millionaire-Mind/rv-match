-- Fixes a privilege-escalation hole in the `profiles` RLS policy, and
-- establishes the role grants that policy depends on (20260101000008 added
-- RLS policies but never granted the underlying table privileges they
-- assume - on a real Supabase project the platform provisions those
-- automatically, but that made the gap invisible until tested against a
-- role that only has what these migrations actually grant).
--
-- 1) Baseline role stand-ins + grants
-- ------------------------------------------------------------------------
-- Supabase provisions `anon` / `authenticated` / `service_role` on every
-- project with broad table grants already in place, and relies on RLS
-- policies alone to restrict access per-row. The `if not exists` guards
-- below make role creation a no-op against a real Supabase project (the
-- roles already exist there); the grants are plain idempotent GRANTs, safe
-- to re-run anywhere. This keeps the migration portable to both a real
-- Supabase project and any plain Postgres 15+ instance, per README.md.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant all on tables to service_role;

-- 2) The actual fix: column-scope the `profiles` UPDATE grant
-- ------------------------------------------------------------------------
-- `profiles_update_own` (see 20260101000008_rls_policies.sql) only
-- restricts WHICH ROW a caller may update:
--
--   for update using (id = auth.uid()) with check (id = auth.uid())
--
-- It says nothing about which COLUMNS may change. RLS is row-level
-- authorization only, so with the broad `authenticated` UPDATE grant above,
-- an authenticated user could run:
--
--   update profiles set platform_role = 'platform_admin' where id = auth.uid()
--
-- and satisfy both the USING and WITH CHECK clauses, self-promoting to
-- platform admin. Column-level authorization requires Postgres column
-- privileges layered on top of RLS.
--
-- This application never routes profile writes through PostgREST today
-- (server code uses a direct/service-role Postgres connection via Drizzle -
-- see ARCHITECTURE.md), so this is defense-in-depth, consistent with how
-- RLS is documented everywhere else in this project: it must hold even if
-- PostgREST/a browser Supabase client is ever pointed at this table.
--
-- Only genuinely user-editable fields may be written by the `authenticated`
-- role directly. `platform_role`, `email`, and `id` remain writable only by
-- the service role (i.e. trusted server-side code, such as
-- src/server/admin/dealer-actions.ts's dealer-approval flow or a future
-- explicit "grant platform_admin" admin action - never by a user's own
-- request).
revoke update on profiles from authenticated, anon;
grant update (full_name, phone, updated_at) on profiles to authenticated;
