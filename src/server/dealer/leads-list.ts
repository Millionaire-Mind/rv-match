import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, inventory, leads, profiles } from "@/server/db/schema";

export async function getDealerLeads(dealershipId: string, status?: string) {
  const rows = await db
    .select({
      lead: leads,
      rv: inventory,
    })
    .from(leads)
    .innerJoin(inventory, eq(leads.inventoryId, inventory.id))
    .where(
      status
        ? and(eq(leads.dealershipId, dealershipId), eq(leads.status, status as (typeof leads.status.enumValues)[number]))
        : eq(leads.dealershipId, dealershipId),
    )
    .orderBy(desc(leads.createdAt));

  return rows;
}

/** Active team members only — used for the lead-assignment dropdown; deactivated members shouldn't receive new assignments. */
export async function getDealerTeam(dealershipId: string) {
  const rows = await db
    .select({ userId: dealershipUsers.userId, fullName: profiles.fullName, email: profiles.email })
    .from(dealershipUsers)
    .innerJoin(profiles, eq(dealershipUsers.userId, profiles.id))
    .where(and(eq(dealershipUsers.dealershipId, dealershipId), eq(dealershipUsers.active, true)));
  return rows;
}
