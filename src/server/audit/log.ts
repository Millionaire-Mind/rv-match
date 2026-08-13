import { db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { authGetUserId } from "@/server/auth/provider";

export async function logAudit(params: {
  action: string;
  entityType: string;
  entityId?: string;
  dealershipId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const actorId = await authGetUserId();
  await db.insert(auditLogs).values({
    actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    dealershipId: params.dealershipId,
    metadata: params.metadata ?? {},
  });
}
