"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { adminConfiguration } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import {
  intentWeightsSchema,
  pilotDefaultsSchema,
  platformConfigSchema,
  recommendationWeightsSchema,
} from "@/server/recommendation/config";
import { logAudit } from "@/server/audit/log";
import { eq } from "drizzle-orm";

const SCHEMAS = {
  recommendation_weights: recommendationWeightsSchema,
  intent_weights: intentWeightsSchema,
  pilot_defaults: pilotDefaultsSchema,
  platform: platformConfigSchema,
} as const;

export type ConfigKey = keyof typeof SCHEMAS;

export type ConfigFormState = { ok: false; error: string } | { ok: true };

export async function updateAdminConfiguration(
  key: ConfigKey,
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  const adminId = await requireAdmin();

  const raw = formData.get("json");
  if (typeof raw !== "string") return { ok: false, error: "Missing configuration payload." };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }

  const schema = SCHEMAS[key];
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }

  await db
    .insert(adminConfiguration)
    .values({ key, value: parsed.data, updatedBy: adminId })
    .onConflictDoUpdate({
      target: adminConfiguration.key,
      set: { value: parsed.data, updatedBy: adminId, updatedAt: new Date() },
    });

  await logAudit({ action: "config.update", entityType: "admin_configuration", entityId: key });
  revalidatePath("/admin/config");
  return { ok: true };
}

export async function getAdminConfigurationValue(key: ConfigKey): Promise<unknown> {
  const [row] = await db
    .select({ value: adminConfiguration.value })
    .from(adminConfiguration)
    .where(eq(adminConfiguration.key, key))
    .limit(1);
  return row?.value ?? null;
}
