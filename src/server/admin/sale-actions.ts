"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { attributedSales, dealerPilots } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { logAudit } from "@/server/audit/log";

/**
 * Verification must be idempotent and race-safe: two concurrent calls for
 * the same sale (double click, retried request) must increment the pilot's
 * verifiedSalesCount at most once. The conditional UPDATE ... WHERE
 * verification_status != 'verified' does the real work here - Postgres
 * takes a row lock on the first transaction to reach it, and the second
 * transaction's UPDATE (under READ COMMITTED) re-evaluates the WHERE clause
 * against the now-committed row once the lock releases, finds
 * verification_status already 'verified', and affects zero rows. Only a
 * transaction that actually flipped the row increments the counter.
 */
export async function verifySale(saleId: string): Promise<void> {
  const adminId = await requireAdmin();

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(attributedSales)
      .set({ verificationStatus: "verified", verifiedBy: adminId, verifiedAt: new Date() })
      .where(and(eq(attributedSales.id, saleId), ne(attributedSales.verificationStatus, "verified")))
      .returning({ dealershipId: attributedSales.dealershipId });

    if (!updated) return; // Missing, or already verified by another call - no-op either way.

    // Only verified sales count toward the Founding Dealer pilot threshold.
    await tx
      .update(dealerPilots)
      .set({ verifiedSalesCount: sql`${dealerPilots.verifiedSalesCount} + 1` })
      .where(eq(dealerPilots.dealershipId, updated.dealershipId));

    await logAudit(
      { action: "sale.verify", entityType: "attributed_sale", entityId: saleId, dealershipId: updated.dealershipId },
      tx,
    );
  });

  revalidatePath("/admin/sales");
  revalidatePath("/dealer/pilot");
}

/**
 * Rejecting a previously-verified sale must undo its contribution to the
 * pilot counter, or the dealer's verified-sales progress would stay
 * permanently inflated. `for("update")` locks the row before deciding
 * whether to decrement, so a concurrent verify/reject on the same sale
 * can't race past this transaction's view of the prior status.
 */
export async function rejectSale(saleId: string): Promise<void> {
  await requireAdmin();

  await db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ dealershipId: attributedSales.dealershipId, verificationStatus: attributedSales.verificationStatus })
      .from(attributedSales)
      .where(eq(attributedSales.id, saleId))
      .for("update");
    if (!previous) return;

    await tx.update(attributedSales).set({ verificationStatus: "rejected" }).where(eq(attributedSales.id, saleId));

    if (previous.verificationStatus === "verified") {
      await tx
        .update(dealerPilots)
        .set({ verifiedSalesCount: sql`greatest(${dealerPilots.verifiedSalesCount} - 1, 0)` })
        .where(eq(dealerPilots.dealershipId, previous.dealershipId));
    }

    await logAudit(
      { action: "sale.reject", entityType: "attributed_sale", entityId: saleId, dealershipId: previous.dealershipId },
      tx,
    );
  });

  revalidatePath("/admin/sales");
  revalidatePath("/dealer/pilot");
}
