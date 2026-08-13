"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { creators, distributionCampaigns } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { logAudit } from "@/server/audit/log";
import { generateUniqueCampaignCode } from "@/server/distribution/campaign-code";

export type CreatorFormState = { ok: false; error: string } | { ok: true };

export async function createCreator(_prev: CreatorFormState, formData: FormData): Promise<CreatorFormState> {
  const adminId = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!name) return { ok: false, error: "Name is required." };

  const [row] = await db.insert(creators).values({ name, contactEmail, notes }).returning({ id: creators.id });
  await logAudit({ action: "creator.create", entityType: "creator", entityId: row.id, metadata: { adminId } });
  revalidatePath("/admin/creators");
  return { ok: true };
}

export async function setCreatorActive(creatorId: string, active: boolean): Promise<void> {
  const adminId = await requireAdmin();
  await db.update(creators).set({ active }).where(eq(creators.id, creatorId));
  await logAudit({
    action: active ? "creator.activate" : "creator.deactivate",
    entityType: "creator",
    entityId: creatorId,
    metadata: { adminId },
  });
  revalidatePath("/admin/creators");
}

export async function listCreators() {
  await requireAdmin();
  return db.select().from(creators).orderBy(desc(creators.createdAt));
}

export type CreatorCampaignFormState = { ok: false; error: string } | { ok: true; code: string };

/** A creator's referral link - no payments tracked (platform explicitly excludes that), just identity + attribution. */
export async function createCreatorCampaign(
  _prev: CreatorCampaignFormState,
  formData: FormData,
): Promise<CreatorCampaignFormState> {
  const adminId = await requireAdmin();
  const creatorId = String(formData.get("creatorId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!creatorId || !name) return { ok: false, error: "Creator and link name are required." };

  const code = await generateUniqueCampaignCode();
  const [row] = await db
    .insert(distributionCampaigns)
    .values({ creatorId, code, name, campaignType: "creator" })
    .returning({ id: distributionCampaigns.id, code: distributionCampaigns.code });

  await logAudit({ action: "creator_campaign.create", entityType: "distribution_campaign", entityId: row.id, metadata: { adminId, creatorId } });
  revalidatePath("/admin/creators");
  return { ok: true, code: row.code };
}

export async function listCreatorCampaigns(creatorId: string) {
  await requireAdmin();
  return db.select().from(distributionCampaigns).where(eq(distributionCampaigns.creatorId, creatorId)).orderBy(desc(distributionCampaigns.createdAt));
}
