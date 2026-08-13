import type { DealerRole } from "@/server/validation/enums";

/**
 * Dealer role permission matrix (see dealerRoleDescriptions in
 * src/server/validation/enums.ts for the human-readable version shown in
 * the UI). Each group below is passed as the `allowedRoles` argument to
 * requireDealerRole at the relevant server action call sites - this file is
 * the single place the actual matrix is defined so it can't drift between
 * call sites.
 */

/** Dealership configuration, team management, pilot settings. */
export const OWNER_ONLY: readonly DealerRole[] = ["owner"];

/** Inventory create/edit/publish/CSV-feed-import, and full lead pipeline management (assignment, any lead). */
export const MANAGEMENT_ROLES: readonly DealerRole[] = ["owner", "sales_manager"];

/** Working an assigned/unassigned lead: status changes, notes, appointments, the sold workflow. */
export const LEAD_WORKING_ROLES: readonly DealerRole[] = ["owner", "sales_manager", "salesperson"];

/** Campaigns, QR/distribution center, inventory marketing. */
export const MARKETING_ROLES: readonly DealerRole[] = ["owner", "marketing"];

/** Dashboard/analytics viewing. */
export const ANALYTICS_ROLES: readonly DealerRole[] = ["owner", "sales_manager", "marketing"];

/** Every dealer role - used where an action just needs "some dealership membership", not a specific one. */
export const ALL_DEALER_ROLES: readonly DealerRole[] = ["owner", "sales_manager", "salesperson", "marketing"];

/**
 * A salesperson only works leads assigned to them (or unclaimed leads);
 * a sales manager or owner can see/manage every lead at the dealership.
 * Used to scope lead list/detail queries, not just gate the action itself.
 */
export function canViewAnyLead(role: DealerRole): boolean {
  return role === "owner" || role === "sales_manager";
}
