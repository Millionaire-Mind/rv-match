"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { accountDeletionRequests, consumerProfiles } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { logAudit } from "@/server/audit/log";

export interface DeletionRequestRow {
  id: string;
  consumerProfileId: string | null;
  status: "pending" | "completed";
  requestedAt: Date;
  completedAt: Date | null;
}

export async function listDeletionRequests(limit = 200): Promise<DeletionRequestRow[]> {
  const rows = await db
    .select()
    .from(accountDeletionRequests)
    .orderBy(desc(accountDeletionRequests.requestedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    consumerProfileId: r.consumerProfileId,
    status: r.status as "pending" | "completed",
    requestedAt: r.requestedAt,
    completedAt: r.completedAt,
  }));
}

/**
 * Actually deletes the consumer_profiles row (cascading through
 * swipe_decisions/saved_inventory/consumer_preferences/notifications and
 * detaching - not deleting - any leads a dealer submitted them to, per the
 * FK design in schema.ts), then marks the request completed. If the
 * profile was already gone (e.g. deleted by some other path), still marks
 * the request completed rather than erroring - the actual privacy
 * obligation ("their data is gone") is already satisfied either way.
 */
export async function completeAccountDeletion(requestId: string): Promise<void> {
  const adminId = await requireAdmin();

  const [request] = await db
    .select()
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.id, requestId))
    .limit(1);
  if (!request || request.status === "completed") return;

  if (request.consumerProfileId) {
    await db.delete(consumerProfiles).where(eq(consumerProfiles.id, request.consumerProfileId));
  }

  await db
    .update(accountDeletionRequests)
    .set({ status: "completed", completedAt: new Date(), completedBy: adminId })
    .where(eq(accountDeletionRequests.id, requestId));

  await logAudit({ action: "privacy.deletion_completed", entityType: "account_deletion_request", entityId: requestId });
  revalidatePath("/admin/privacy-requests");
}
