import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, profiles } from "@/server/db/schema";

let currentToken: string | undefined;
let currentAnonymousSessionId: string | undefined;
let realIpHeader: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "rvm_auth" && currentToken) return { value: currentToken };
      if (name === "rvm_session" && currentAnonymousSessionId) return { value: currentAnonymousSessionId };
      return undefined;
    },
    set: (name: string, value: string) => {
      if (name === "rvm_auth") currentToken = value;
      if (name === "rvm_session") currentAnonymousSessionId = value;
    },
    delete: () => {
      currentToken = undefined;
    },
  }),
  headers: async () => ({
    get: (name: string) => (name === "x-real-ip" ? realIpHeader : undefined),
  }),
}));

const redirectCalls: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirectCalls.push(path);
    throw new Error("NEXT_REDIRECT_TEST_SENTINEL");
  },
}));

const { signInAction, signUpAction } = await import("./actions");
const { getOrCreateAnonymousSessionId } = await import("./anonymous");

const suffix = Date.now();
const createdUserIds: string[] = [];
const createdAnonymousSessionIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  // consumer_profiles must go first - deleting an anonymous_sessions row
  // it still references would SET NULL its anonymous_session_id, and a
  // row left with both user_id and anonymous_session_id null violates the
  // "exactly one identity" check constraint (a leftover unmerged "fresh"
  // test profile is exactly that case).
  for (const id of createdAnonymousSessionIds) {
    await db.delete(consumerProfiles).where(eq(consumerProfiles.anonymousSessionId, id));
  }
  for (const id of createdAnonymousSessionIds) {
    await db.delete(anonymousSessions).where(eq(anonymousSessions.id, id));
  }
});

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("signInAction rate limiting", () => {
  it("blocks further attempts from the same IP after the threshold, independent of which account is targeted", async () => {
    realIpHeader = `203.0.113.${suffix % 200}`;

    // A different email on every attempt so the (lower-threshold)
    // email-keyed bucket never itself triggers - isolating this test to
    // the IP-keyed limit specifically.
    let lastResult: Awaited<ReturnType<typeof signInAction>> | undefined;
    for (let i = 0; i < 20; i++) {
      lastResult = await signInAction(
        { error: null },
        formData({ email: `ip-limit-${suffix}-${i}@example.com`, password: "WrongPassword123!" }),
      );
    }
    expect(lastResult).toEqual({ error: "Invalid email or password." }); // 20th real attempt still processed

    const blocked = await signInAction(
      { error: null },
      formData({ email: `ip-limit-${suffix}-overflow@example.com`, password: "WrongPassword123!" }),
    );
    expect(blocked).toEqual({ error: "Too many login attempts. Please try again in a few minutes." });
  });

  it("blocks further attempts against the same email even from a fresh IP each time", async () => {
    const email = `ratelimit-email-${suffix}@example.com`;

    // A different IP on every attempt so the IP-keyed bucket never itself
    // triggers - isolating this test to the email-keyed limit.
    for (let i = 0; i < 10; i++) {
      realIpHeader = `198.51.100.${i}`;
      await signInAction({ error: null }, formData({ email, password: "WrongPassword123!" }));
    }

    realIpHeader = "198.51.100.250"; // yet another fresh IP
    const blocked = await signInAction({ error: null }, formData({ email, password: "WrongPassword123!" }));
    expect(blocked).toEqual({ error: "Too many login attempts. Please try again in a few minutes." });
  });
});

describe("signUpAction rate limiting", () => {
  it("blocks further signups from the same IP after the threshold", async () => {
    realIpHeader = `203.0.113.${(suffix + 1) % 200}`;

    for (let i = 0; i < 10; i++) {
      const email = `ratelimit-signup-${suffix}-${i}@example.com`;
      // Every successful signup redirects (throws via the mock above).
      await expect(
        signUpAction({ error: null }, formData({ email, password: "TestPassword123!", fullName: "Test User" })),
      ).rejects.toThrow("NEXT_REDIRECT_TEST_SENTINEL");

      const [user] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email));
      if (user) createdUserIds.push(user.id);
    }

    const blocked = await signUpAction(
      { error: null },
      formData({ email: `ratelimit-signup-${suffix}-overflow@example.com`, password: "TestPassword123!", fullName: "Test User" }),
    );
    expect(blocked).toEqual({ error: "Too many signup attempts. Please try again later." });
  });
});

describe("signUpAction anonymous-history merge choice (Gap 12)", () => {
  it("merges the browser's existing anonymous shopping history by default (historyChoice omitted)", async () => {
    realIpHeader = `203.0.113.${(suffix + 10) % 200}`;
    currentToken = undefined;
    currentAnonymousSessionId = undefined;

    // Build up real anonymous shopping history in this "browser" before signing up.
    // getOrCreateAnonymousSessionId never writes the cookie itself (only
    // middleware/a Server Action may) - simulate what middleware would
    // already have done for a real visitor's browser.
    const anonymousSessionId = await getOrCreateAnonymousSessionId();
    currentAnonymousSessionId = anonymousSessionId;
    createdAnonymousSessionIds.push(anonymousSessionId);
    const [anonProfile] = await db
      .insert(consumerProfiles)
      .values({ anonymousSessionId, decisionsCount: 7 })
      .returning({ id: consumerProfiles.id });

    const email = `merge-default-${suffix}@example.com`;
    await expect(
      signUpAction({ error: null }, formData({ email, password: "TestPassword123!", fullName: "Test User" })),
    ).rejects.toThrow("NEXT_REDIRECT_TEST_SENTINEL");

    const [user] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email));
    createdUserIds.push(user.id);

    const [merged] = await db.select().from(consumerProfiles).where(eq(consumerProfiles.id, anonProfile.id));
    expect(merged.userId).toBe(user.id);
    expect(merged.decisionsCount).toBe(7); // the prior history itself carried forward, not reset
  });

  it("does NOT attach the browser's history when 'fresh' is explicitly chosen - a brand-new, empty profile instead", async () => {
    realIpHeader = `203.0.113.${(suffix + 11) % 200}`;
    currentToken = undefined;
    currentAnonymousSessionId = undefined;

    const anonymousSessionId = await getOrCreateAnonymousSessionId();
    createdAnonymousSessionIds.push(anonymousSessionId);
    const [anonProfile] = await db
      .insert(consumerProfiles)
      .values({ anonymousSessionId, decisionsCount: 9 })
      .returning({ id: consumerProfiles.id });

    const email = `merge-fresh-${suffix}@example.com`;
    await expect(
      signUpAction(
        { error: null },
        formData({ email, password: "TestPassword123!", fullName: "Test User", historyChoice: "fresh" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT_TEST_SENTINEL");

    const [user] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email));
    createdUserIds.push(user.id);

    // The old anonymous profile is untouched - never attached to this user.
    const [untouched] = await db.select().from(consumerProfiles).where(eq(consumerProfiles.id, anonProfile.id));
    expect(untouched.userId).toBeNull();

    // The new user's own profile (if the app happens to have created one
    // yet) must not be the old one and must not carry its decision count.
    const [newUserProfile] = await db.select().from(consumerProfiles).where(eq(consumerProfiles.userId, user.id));
    if (newUserProfile) {
      expect(newUserProfile.id).not.toBe(anonProfile.id);
      expect(newUserProfile.decisionsCount).toBe(0);
    }

    // The anonymous-session cookie was rotated to a new, unrelated session id.
    expect(currentAnonymousSessionId).toBeDefined();
    expect(currentAnonymousSessionId).not.toBe(anonymousSessionId);
    if (currentAnonymousSessionId) createdAnonymousSessionIds.push(currentAnonymousSessionId);
  });
});
