import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { accountDeletionRequests, anonymousSessions, consumerProfiles, profiles, swipeDecisions, inventory, dealerships } from "@/server/db/schema";

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
const { listDeletionRequests, completeAccountDeletion } = await import("@/server/admin/privacy-requests");

let dealershipId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
let rvId: string;
let requestId: string;
let adminUserId: string;
let nonAdminUserId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_privacy_requests__",
      slug: `__test-privacy-requests-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `privacy-requests-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `PRIV-REQ-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 4000000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  rvId = rv.id;
  await db.insert(swipeDecisions).values({ consumerProfileId, inventoryId: rvId, decision: "love" });

  const [request] = await db
    .insert(accountDeletionRequests)
    .values({ consumerProfileId })
    .returning({ id: accountDeletionRequests.id });
  requestId = request.id;

  const admin = await localSignUp({ email: `privacy-requests-admin-${suffix}@example.com`, password: "TestPassword123!" });
  adminUserId = admin.userId;
  await db.update(profiles).set({ platformRole: "platform_admin" }).where(eq(profiles.id, adminUserId));

  const nonAdmin = await localSignUp({ email: `privacy-requests-user-${suffix}@example.com`, password: "TestPassword123!" });
  nonAdminUserId = nonAdmin.userId;
});

afterAll(async () => {
  await db.delete(accountDeletionRequests).where(eq(accountDeletionRequests.id, requestId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("listDeletionRequests", () => {
  it("includes the pending request", async () => {
    const rows = await listDeletionRequests();
    const row = rows.find((r) => r.id === requestId);
    expect(row).toBeDefined();
    expect(row!.status).toBe("pending");
    expect(row!.consumerProfileId).toBe(consumerProfileId);
  });
});

describe("completeAccountDeletion", () => {
  it("rejects a non-admin caller and leaves the profile intact", async () => {
    currentToken = signSessionToken(nonAdminUserId);
    const { ForbiddenError } = await import("@/server/auth/guards");
    await expect(completeAccountDeletion(requestId)).rejects.toThrow(ForbiddenError);

    const [row] = await db.select().from(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
    expect(row).toBeDefined();
  });

  it("deletes the consumer profile (cascading swipe decisions) and marks the request completed", async () => {
    currentToken = signSessionToken(adminUserId);
    await completeAccountDeletion(requestId);

    const [profileRow] = await db.select().from(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
    expect(profileRow).toBeUndefined();

    const swipeRows = await db.select().from(swipeDecisions).where(eq(swipeDecisions.consumerProfileId, consumerProfileId));
    expect(swipeRows).toHaveLength(0);

    const [requestRow] = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.id, requestId));
    expect(requestRow.status).toBe("completed");
    expect(requestRow.completedAt).not.toBeNull();
    expect(requestRow.completedBy).toBe(adminUserId);
    // The request row itself survives the profile's own deletion as an
    // audit record (onDelete: "set null", not cascade) - only the FK
    // reference to the now-gone profile is cleared.
    expect(requestRow.consumerProfileId).toBeNull();
  });

  it("is a no-op on a request that's already completed", async () => {
    currentToken = signSessionToken(adminUserId);
    await expect(completeAccountDeletion(requestId)).resolves.toBeUndefined();
  });
});
