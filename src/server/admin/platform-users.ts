import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, dealershipUsers, profiles } from "@/server/db/schema";

export interface PlatformUserRow {
  id: string;
  email: string;
  fullName: string | null;
  platformRole: "consumer" | "platform_admin";
  createdAt: Date;
  dealerships: { dealershipId: string; dealershipName: string; role: string; active: boolean }[];
}

/**
 * Every account in `profiles` - platform admins, dealer team members, and
 * signed-up consumers alike - with their dealership memberships (if any)
 * attached. Read-only: this is a platform-ops visibility surface, not an
 * account-editing tool, so it deliberately has no promote/demote/deactivate
 * controls (see admin/videos and admin/campaigns for where real admin
 * actions do exist in this phase).
 */
export async function listPlatformUsers(limit = 200): Promise<PlatformUserRow[]> {
  const userRows = await db.select().from(profiles).orderBy(desc(profiles.createdAt)).limit(limit);
  if (userRows.length === 0) return [];

  const membershipRows = await db
    .select({
      userId: dealershipUsers.userId,
      dealershipId: dealershipUsers.dealershipId,
      dealershipName: dealerships.name,
      role: dealershipUsers.role,
      active: dealershipUsers.active,
    })
    .from(dealershipUsers)
    .innerJoin(dealerships, eq(dealershipUsers.dealershipId, dealerships.id));

  const membershipsByUser = new Map<string, PlatformUserRow["dealerships"]>();
  for (const m of membershipRows) {
    const list = membershipsByUser.get(m.userId) ?? [];
    list.push({ dealershipId: m.dealershipId, dealershipName: m.dealershipName, role: m.role, active: m.active });
    membershipsByUser.set(m.userId, list);
  }

  return userRows.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    platformRole: u.platformRole,
    createdAt: u.createdAt,
    dealerships: membershipsByUser.get(u.id) ?? [],
  }));
}
