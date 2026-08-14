import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers } from "@/server/db/schema";
import type { DealerRole } from "@/server/validation/enums";
import { notifyDealerUser, type NotifyParams } from "./create";

/** Active dealership members holding any of the given roles - the set a dealer-facing notification should fan out to. */
async function getActiveDealerUserIds(dealershipId: string, roles: readonly DealerRole[]): Promise<string[]> {
  const rows = await db
    .select({ userId: dealershipUsers.userId })
    .from(dealershipUsers)
    .where(and(eq(dealershipUsers.dealershipId, dealershipId), eq(dealershipUsers.active, true), inArray(dealershipUsers.role, roles)));
  return rows.map((r) => r.userId);
}

export async function notifyDealerTeam(
  dealershipId: string,
  roles: readonly DealerRole[],
  params: NotifyParams,
): Promise<void> {
  const userIds = await getActiveDealerUserIds(dealershipId, roles);
  await Promise.all(userIds.map((userId) => notifyDealerUser(userId, dealershipId, params)));
}
