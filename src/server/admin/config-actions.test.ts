import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { adminConfiguration, auditLogs, profiles } from "@/server/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");
const { updateAdminConfiguration } = await import("./config-actions");

let adminUserId: string;
let nonAdminUserId: string;
// admin_configuration is a shared, platform-wide table other concurrently
// running test files also read (loadPlatformConfig() etc.) - snapshot and
// restore the "platform" row's exact prior state rather than leaving this
// test's payload behind, so it can't make other tests flaky.
let originalPlatformRow: { value: unknown } | undefined;

beforeAll(async () => {
  const suffix = Date.now();
  const admin = await localSignUp({ email: `config-actions-admin-${suffix}@example.com`, password: "TestPassword123!" });
  adminUserId = admin.userId;
  await db.update(profiles).set({ platformRole: "platform_admin" }).where(eq(profiles.id, adminUserId));

  const nonAdmin = await localSignUp({ email: `config-actions-user-${suffix}@example.com`, password: "TestPassword123!" });
  nonAdminUserId = nonAdmin.userId;

  [originalPlatformRow] = await db
    .select({ value: adminConfiguration.value })
    .from(adminConfiguration)
    .where(eq(adminConfiguration.key, "platform"));
});

afterAll(async () => {
  if (originalPlatformRow) {
    await db
      .update(adminConfiguration)
      .set({ value: originalPlatformRow.value })
      .where(eq(adminConfiguration.key, "platform"));
  } else {
    await db.delete(adminConfiguration).where(eq(adminConfiguration.key, "platform"));
  }
  await db.delete(profiles).where(eq(profiles.id, adminUserId));
  await db.delete(profiles).where(eq(profiles.id, nonAdminUserId));
});

function formData(json: unknown): FormData {
  const fd = new FormData();
  fd.set("json", JSON.stringify(json));
  return fd;
}

describe("updateAdminConfiguration", () => {
  it("saves the config and writes an audit log row without throwing on the entityId type mismatch", async () => {
    currentToken = signSessionToken(adminUserId);
    const payload = { activationThreshold: 11, matchCompleteThreshold: 21, locationPromptThreshold: 9 };

    const result = await updateAdminConfiguration("platform", { ok: false, error: "" }, formData(payload));
    expect(result).toEqual({ ok: true });

    const [row] = await db.select().from(adminConfiguration).where(eq(adminConfiguration.key, "platform"));
    expect(row.value).toEqual(payload);
    expect(row.updatedBy).toBe(adminUserId);

    const [auditRow] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "config.update"))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    expect(auditRow).toBeDefined();
    expect(auditRow.entityId).toBeNull();
    expect(auditRow.metadata).toEqual({ key: "platform" });
  });

  it("rejects a non-admin caller", async () => {
    currentToken = signSessionToken(nonAdminUserId);
    const { ForbiddenError } = await import("@/server/auth/guards");
    await expect(
      updateAdminConfiguration(
        "platform",
        { ok: false, error: "" },
        formData({ activationThreshold: 1, matchCompleteThreshold: 2, locationPromptThreshold: 3 }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects an invalid payload for the schema", async () => {
    currentToken = signSessionToken(adminUserId);
    const result = await updateAdminConfiguration("platform", { ok: false, error: "" }, formData({ activationThreshold: "not a number" }));
    expect(result.ok).toBe(false);
  });
});
