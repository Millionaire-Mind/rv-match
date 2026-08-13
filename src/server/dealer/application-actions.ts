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

  const [dealership] = await db
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

  await db.insert(dealershipUsers).values({
    dealershipId: dealership.id,
    userId,
    role: "owner",
  });

  await db.insert(dealerPilots).values({
    dealershipId: dealership.id,
    trialDays: pilotDefaults.trial_days,
    salesThreshold: pilotDefaults.sales_threshold,
    status: "pending",
  });

  await logAudit({
    action: "dealer.apply",
    entityType: "dealership",
    entityId: dealership.id,
    dealershipId: dealership.id,
  });

  return { ok: true };
}
