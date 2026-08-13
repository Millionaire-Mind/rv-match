"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { attributedSales, inventory, leadActivity, leads } from "@/server/db/schema";
import { requireDealerRole } from "@/server/auth/guards";
import { leadStatusSchema } from "@/server/validation/enums";
import { logAudit } from "@/server/audit/log";

async function requireLeadInDealership(dealershipId: string, leadId: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead || lead.dealershipId !== dealershipId) {
    throw new Error("Lead not found.");
  }
  return lead;
}

export async function updateLeadStatus(
  dealershipId: string,
  leadId: string,
  status: z.infer<typeof leadStatusSchema>,
  note?: string,
): Promise<void> {
  const { userId } = await requireDealerRole(dealershipId);
  const lead = await requireLeadInDealership(dealershipId, leadId);

  await db.update(leads).set({ status }).where(eq(leads.id, leadId));
  await db.insert(leadActivity).values({
    leadId,
    actorId: userId,
    activityType: "status_change",
    fromStatus: lead.status,
    toStatus: status,
    note: note || null,
  });
  await logAudit({ action: "lead.status_change", entityType: "lead", entityId: leadId, dealershipId, metadata: { from: lead.status, to: status } });
  revalidatePath("/dealer/leads");
  revalidatePath(`/dealer/leads/${leadId}`);
}

export async function assignLead(dealershipId: string, leadId: string, assigneeId: string): Promise<void> {
  const { userId } = await requireDealerRole(dealershipId);
  await requireLeadInDealership(dealershipId, leadId);

  await db.update(leads).set({ assignedTo: assigneeId }).where(eq(leads.id, leadId));
  await db.insert(leadActivity).values({
    leadId,
    actorId: userId,
    activityType: "assignment",
    note: `Assigned to team member.`,
  });
  revalidatePath(`/dealer/leads/${leadId}`);
}

export async function addLeadNote(dealershipId: string, leadId: string, note: string): Promise<void> {
  if (!note.trim()) return;
  const { userId } = await requireDealerRole(dealershipId);
  await requireLeadInDealership(dealershipId, leadId);

  await db.insert(leadActivity).values({
    leadId,
    actorId: userId,
    activityType: "note",
    note: note.trim(),
  });
  revalidatePath(`/dealer/leads/${leadId}`);
}

function isUniqueViolation(err: unknown, constraintName: string): boolean {
  // drizzle-orm wraps the driver's PostgresError in a DrizzleQueryError with
  // the original error on `.cause` - check both, since which one carries
  // the Postgres error fields (`code` / `constraint_name`) isn't guaranteed
  // to stay the same across drizzle-orm/postgres.js versions.
  for (const candidate of [err, (err as { cause?: unknown } | null)?.cause]) {
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as { code?: string }).code === "23505" &&
      (candidate as { constraint_name?: string }).constraint_name === constraintName
    ) {
      return true;
    }
  }
  return false;
}

const markSoldSchema = z.object({
  soldInventoryId: z.uuid(),
  salePrice: z.coerce.number().nonnegative().optional(),
  saleDate: z.string().min(1),
  notes: z.string().optional(),
});

export type MarkSoldState = { ok: false; error: string } | { ok: true };

export async function markLeadSold(
  dealershipId: string,
  leadId: string,
  _prev: MarkSoldState,
  formData: FormData,
): Promise<MarkSoldState> {
  const { userId } = await requireDealerRole(dealershipId);
  const lead = await requireLeadInDealership(dealershipId, leadId);

  const parsed = markSoldSchema.safeParse({
    soldInventoryId: formData.get("soldInventoryId"),
    salePrice: formData.get("salePrice") || undefined,
    saleDate: formData.get("saleDate"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const d = parsed.data;

  const [soldRv] = await db.select().from(inventory).where(eq(inventory.id, d.soldInventoryId)).limit(1);
  if (!soldRv || soldRv.dealershipId !== dealershipId) {
    return { ok: false, error: "Select a valid RV from your inventory." };
  }

  try {
    await db.transaction(async (tx) => {
      // The unique constraint on attributed_sales.lead_id is the actual
      // guard against a double form submit racing this same check; this
      // insert is the only write in the transaction that can violate it.
      await tx.insert(attributedSales).values({
        leadId,
        dealershipId,
        soldInventoryId: d.soldInventoryId,
        isOriginalLeadRv: d.soldInventoryId === lead.inventoryId,
        salePriceCents: d.salePrice ? Math.round(d.salePrice * 100) : null,
        saleDate: d.saleDate,
        salespersonId: userId,
        notes: d.notes || null,
        verificationStatus: "dealer_reported",
      });

      await tx
        .update(inventory)
        .set({ status: "sold", dateSold: new Date() })
        .where(eq(inventory.id, d.soldInventoryId));

      await tx.update(leads).set({ status: "sold" }).where(eq(leads.id, leadId));
      await tx.insert(leadActivity).values({
        leadId,
        actorId: userId,
        activityType: "status_change",
        fromStatus: lead.status,
        toStatus: "sold",
        note: "Marked sold; sale reported for verification.",
      });

      await logAudit({ action: "lead.mark_sold", entityType: "lead", entityId: leadId, dealershipId }, tx);
    });
  } catch (err) {
    if (isUniqueViolation(err, "attributed_sales_lead_id_unique")) {
      return { ok: false, error: "This lead has already been marked sold." };
    }
    throw err;
  }

  revalidatePath("/dealer/leads");
  revalidatePath(`/dealer/leads/${leadId}`);
  revalidatePath("/dealer/pilot");
  return { ok: true };
}

// Reported (unverified) sales don't count toward the pilot threshold — only
// admin-verified sales do (see src/server/admin/sale-actions.ts).
