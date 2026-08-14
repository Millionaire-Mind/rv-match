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

  await db.transaction(async (tx) => {
    await tx
      .insert(adminConfiguration)
      .values({ key, value: parsed.data, updatedBy: adminId })
      .onConflictDoUpdate({
        target: adminConfiguration.key,
        set: { value: parsed.data, updatedBy: adminId, updatedAt: new Date() },
      });

    // admin_configuration is keyed by a text `key` (e.g. "recommendation_weights"),
    // not a uuid - entityId is a uuid column, so the config key belongs in
    // metadata instead of being forced into entityId.
    await logAudit({ action: "config.update", entityType: "admin_configuration", metadata: { key } }, tx);
  });

  revalidatePath("/admin/config");
  return { ok: true };
}
