"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerPilots, dealerships } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { logAudit } from "@/server/audit/log";

export async function approveDealer(dealershipId: string): Promise<void> {
  const adminId = await requireAdmin();

  await db
    .update(dealerships)
    .set({ status: "approved", approvedAt: new Date(), approvedBy: adminId })
    .where(eq(dealerships.id, dealershipId));

  await db
    .update(dealerPilots)
    .set({ status: "active", startedAt: new Date() })
    .where(eq(dealerPilots.dealershipId, dealershipId));

  await logAudit({ action: "dealer.approve", entityType: "dealership", entityId: dealershipId, dealershipId });
  revalidatePath("/admin/dealers");
}

export async function rejectDealer(dealershipId: string): Promise<void> {
  await requireAdmin();
  await db.update(dealerships).set({ status: "rejected" }).where(eq(dealerships.id, dealershipId));
  await logAudit({ action: "dealer.reject", entityType: "dealership", entityId: dealershipId, dealershipId });
  revalidatePath("/admin/dealers");
}

export async function suspendDealer(dealershipId: string): Promise<void> {
  await requireAdmin();
  await db.update(dealerships).set({ status: "suspended" }).where(eq(dealerships.id, dealershipId));
  await logAudit({ action: "dealer.suspend", entityType: "dealership", entityId: dealershipId, dealershipId });
  revalidatePath("/admin/dealers");
}

export async function reactivateDealer(dealershipId: string): Promise<void> {
  await requireAdmin();
  await db.update(dealerships).set({ status: "approved" }).where(eq(dealerships.id, dealershipId));
  await logAudit({ action: "dealer.reactivate", entityType: "dealership", entityId: dealershipId, dealershipId });
  revalidatePath("/admin/dealers");
}
