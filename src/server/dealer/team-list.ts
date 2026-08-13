import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, profiles } from "@/server/db/schema";

export interface DealerTeamMember {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string;
  role: "owner" | "sales_manager" | "salesperson" | "marketing";
  active: boolean;
  createdAt: Date;
}

/** Every team member (active and deactivated) for the dealer team-management page. */
export async function getDealerTeamDetailed(dealershipId: string): Promise<DealerTeamMember[]> {
  const rows = await db
    .select({
      membershipId: dealershipUsers.id,
      userId: dealershipUsers.userId,
      fullName: profiles.fullName,
      email: profiles.email,
      role: dealershipUsers.role,
      active: dealershipUsers.active,
      createdAt: dealershipUsers.createdAt,
    })
    .from(dealershipUsers)
    .innerJoin(profiles, eq(dealershipUsers.userId, profiles.id))
    .where(eq(dealershipUsers.dealershipId, dealershipId))
    .orderBy(desc(dealershipUsers.createdAt));
  return rows;
}
