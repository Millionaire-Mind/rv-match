-- RV Match — core extensions and enum types
create extension if not exists pgcrypto;

create type platform_role as enum ('consumer', 'platform_admin');
create type dealer_role as enum ('owner', 'staff');
create type dealership_status as enum ('pending', 'approved', 'suspended', 'rejected');
create type pilot_status as enum ('pending', 'active', 'conversion_due', 'converted', 'expired', 'suspended');
create type rv_type as enum (
  'travel_trailer',
  'fifth_wheel',
  'class_a',
  'class_b',
  'class_c',
  'toy_hauler',
  'pop_up',
  'truck_camper',
  'park_model',
  'other'
);
create type rv_condition as enum ('new', 'used');
create type inventory_status as enum ('draft', 'published', 'sold', 'archived');
create type inventory_source as enum ('manual', 'csv_import');
create type video_source as enum ('dealer_upload', 'generated');
create type video_generation_status as enum ('queued', 'processing', 'completed', 'failed');
create type swipe_decision_type as enum ('pass', 'like', 'love', 'more_like_this');
create type lead_cta_type as enum (
  'check_availability',
  'ask_question',
  'request_best_price',
  'schedule_walkthrough'
);
create type preferred_contact_method as enum ('email', 'phone', 'text');
create type lead_status as enum (
  'new',
  'contacted',
  'appointment',
  'showroom',
  'negotiation',
  'sold',
  'lost'
);
create type lead_activity_type as enum ('status_change', 'note', 'assignment', 'contact_logged');
create type sale_verification_status as enum ('dealer_reported', 'verified', 'rejected');

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
