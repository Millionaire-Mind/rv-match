"use server";

import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerPilots, dealerships, dealershipUsers } from "@/server/db/schema";
import { dealerApplicationSchema } from "@/server/validation/dealer";
import { authSignUp, AuthError } from "@/server/auth/provider";
import { loadPilotDefaults } from "@/server/recommendation/config";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/server/audit/log";

export type DealerApplicationState = { ok: false; error: string } | { ok: true };

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base) || "dealer";
  let suffix = 1;
  while (true) {
    const [existing] = await db.select({ id: dealerships.id }).from(dealerships).where(eq(dealerships.slug, slug)).limit(1);
    if (!existing) return slug;
    suffix += 1;
    slug = `${slugify(base)}-${suffix}`;
  }
}

export async function submitDealerApplication(
  _prev: DealerApplicationState,
  formData: FormData,
): Promise<DealerApplicationState> {
  const parsed = dealerApplicationSchema.safeParse({
    dealershipName: formData.get("dealershipName"),
    addressLine1: formData.get("addressLine1"),
    city: formData.get("city"),
    state: formData.get("state"),
    zipCode: formData.get("zipCode"),
    phone: formData.get("phone"),
    website: formData.get("website") || undefined,
    primaryContactName: formData.get("primaryContactName"),
    inventorySizeEstimate: formData.get("inventorySizeEstimate") || undefined,
    email: formData.get("email"),
    password: formData.get("password"),
    agreement: formData.get("agreement") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const d = parsed.data;

  let userId: string;
  try {
    const result = await authSignUp({ email: d.email, password: d.password, fullName: d.primaryContactName });
    userId = result.userId;
  } catch (err) {
    return { ok: false, error: err instanceof AuthError ? err.message : "Could not create your account." };
  }

  const slug = await uniqueSlug(d.dealershipName);
  const pilotDefaults = await loadPilotDefaults();

  // The auth account was already created above (authSignUp has its own
  // side effects that can't be rolled back by a DB transaction), but the
  // dealership + membership + pilot rows must succeed or fail together -
  // otherwise a failure partway through leaves a real signed-up user
  // stranded with no dealership membership (requireDealerContext would
  // bounce them back to this same application form with no way to explain
  // why) or a dealership with no pilot row.
  try {
    await db.transaction(async (tx) => {
      const [dealership] = await tx
        .insert(dealerships)
        .values({
          name: d.dealershipName,
          slug,
          addressLine1: d.addressLine1,
          city: d.city,
          state: d.state.toUpperCase(),
          zipCode: d.zipCode,
          phone: d.phone,
          website: d.website || null,
          primaryContactName: d.primaryContactName,
          primaryContactEmail: d.email,
          inventorySizeEstimate: d.inventorySizeEstimate,
          status: "pending",
        })
        .returning({ id: dealerships.id });

      await tx.insert(dealershipUsers).values({
        dealershipId: dealership.id,
        userId,
        role: "owner",
      });

      await tx.insert(dealerPilots).values({
        dealershipId: dealership.id,
        trialDays: pilotDefaults.trial_days,
        salesThreshold: pilotDefaults.sales_threshold,
        status: "pending",
      });

      await logAudit(
        { action: "dealer.apply", entityType: "dealership", entityId: dealership.id, dealershipId: dealership.id },
        tx,
      );
    });
  } catch {
    return {
      ok: false,
      error: "Your account was created, but we couldn't finish setting up your dealership. Please contact support.",
    };
  }

  return { ok: true };
}
