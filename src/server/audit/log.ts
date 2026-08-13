import { db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { authGetUserId } from "@/server/auth/provider";

/** Accepts either the module-level `db` or a `tx` from `db.transaction(...)`
 * so audit rows can be written as part of the same atomic operation they're
 * recording, instead of as an untracked side effect after commit. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function logAudit(
  params: {
    action: string;
    entityType: string;
    entityId?: string;
    dealershipId?: string;
    metadata?: Record<string, unknown>;
  },
  executor: Executor = db,
): Promise<void> {
  const actorId = await authGetUserId();
  await executor.insert(auditLogs).values({
    actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    dealershipId: params.dealershipId,
    metadata: params.metadata ?? {},
  });
}
