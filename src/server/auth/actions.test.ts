import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { profiles } from "@/server/db/schema";

let currentToken: string | undefined;
let realIpHeader: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: (name: string, value: string) => {
      if (name === "rvm_auth") currentToken = value;
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

const suffix = Date.now();
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(profiles).where(eq(profiles.id, id));
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
