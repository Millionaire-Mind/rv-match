-- Replaces the owner/staff two-role dealer model with the four-role
-- permission matrix the original spec requires: Owner/Admin, Sales
-- Manager, Salesperson, Marketing User. "staff" (the only other value ever
-- assigned) maps to "salesperson", the closest equivalent day-to-day
-- operational role, since neither this repo's seed data nor any known
-- deployment has assigned any other role.
--
-- Also adds dealership_users.active so a dealer owner (or admin) can
-- deactivate a team member's access without deleting their membership
-- history, and dealership_users.invited_by for a minimal audit trail on
-- who added a given team member.

alter type dealer_role rename to dealer_role_old;
create type dealer_role as enum ('owner', 'sales_manager', 'salesperson', 'marketing');

alter table dealership_users alter column role drop default;
alter table dealership_users
  alter column role type dealer_role
  using (case role::text when 'staff' then 'salesperson' else role::text end)::dealer_role;
alter table dealership_users alter column role set default 'salesperson';

drop type dealer_role_old;

alter table dealership_users
  add column active boolean not null default true,
  add column invited_by uuid references profiles (id) on delete set null;
