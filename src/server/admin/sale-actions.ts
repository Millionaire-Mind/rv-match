"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { attributedSales, dealerPilots } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { logAudit } from "@/server/audit/log";

export async function verifySale(saleId: string): Promise<void> {
  const adminId = await requireAdmin();

  const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.id, saleId)).limit(1);
  if (!sale || sale.verificationStatus === "verified") return;

  await db
    .update(attributedSales)
    .set({ verificationStatus: "verified", verifiedBy: adminId, verifiedAt: new Date() })
    .where(eq(attributedSales.id, saleId));

  // Only verified sales count toward the Founding Dealer pilot threshold.
  await db
    .update(dealerPilots)
    .set({ verifiedSalesCount: sql`${dealerPilots.verifiedSalesCount} + 1` })
    .where(eq(dealerPilots.dealershipId, sale.dealershipId));

  await logAudit({
    action: "sale.verify",
    entityType: "attributed_sale",
    entityId: saleId,
    dealershipId: sale.dealershipId,
  });
  revalidatePath("/admin/sales");
}

export async function rejectSale(saleId: string): Promise<void> {
  await requireAdmin();
  const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.id, saleId)).limit(1);
  if (!sale) return;

  await db
    .update(attributedSales)
    .set({ verificationStatus: "rejected" })
    .where(eq(attributedSales.id, saleId));

  await logAudit({
    action: "sale.reject",
    entityType: "attributed_sale",
    entityId: saleId,
    dealershipId: sale.dealershipId,
  });
  revalidatePath("/admin/sales");
}
