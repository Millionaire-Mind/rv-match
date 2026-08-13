-- LOCAL DEVELOPMENT ONLY.
--
-- This file is NOT part of supabase/migrations and must never be applied to
-- a real Supabase project (Supabase already provides and manages the `auth`
-- schema via GoTrue; creating our own would conflict with it).
--
-- It exists so RV Match can be built, seeded, and tested end-to-end in
-- environments without Docker/hosted Supabase access (see
-- IMPLEMENTATION_PLAN.md "Known technical risks"). It stubs just enough of
-- Supabase's `auth.users` shape for our `profiles` trigger and foreign keys
-- to work, plus an `encrypted_password` column and `auth.uid()` function so
-- a minimal local password-auth provider (src/server/auth/local-provider.ts)
-- can operate against plain Postgres.
create schema if not exists auth;
create extension if not exists pgcrypto;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('rvmatch.current_user_id', true), '')::uuid
$$;

-- Role stand-ins (anon/authenticated/service_role) and their baseline grants
-- live in supabase/migrations/20260101000009_fix_profiles_privilege_escalation.sql,
-- not here: that migration is written to be a safe no-op against a real
-- Supabase project (those roles already exist there with these grants), so
-- it can run identically against local Postgres and Supabase rather than
-- needing separate local-only stubbing.
