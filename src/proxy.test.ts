import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

/**
 * Proves the Supabase SSR session-refresh path (Phase 1D) is actually
 * wired into proxy.ts, and that it's skipped entirely for the local HMAC
 * dev provider. This can't be a live integration test without a real
 * Supabase project (no credentials in this environment - see
 * "CONDITIONAL - EXTERNAL CREDENTIAL" in the final compliance report), so
 * it verifies the documented @supabase/ssr contract is followed: getUser()
 * is called (that's what performs the refresh-token exchange when the
 * access token is stale) and any cookies @supabase/ssr asks to set are
 * propagated onto the response - by mocking createServerClient and
 * asserting how proxy.ts drives it.
 */

const { getUser, createServerClient } = vi.hoisted(() => {
  const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
  const createServerClient = vi.fn(
    (_url: string, _key: string, opts: { cookies: { setAll: (c: unknown[]) => void } }) => {
      // Simulate @supabase/ssr deciding the access token needs refreshing
      // and asking the middleware to persist a new session cookie, exactly
      // like a real refresh would via setAll during getUser().
      opts.cookies.setAll([
        { name: "sb-test-project-auth-token", value: "refreshed-token-value", options: { path: "/" } },
      ]);
      return { auth: { getUser } };
    },
  );
  return { getUser, createServerClient };
});

vi.mock("@supabase/ssr", () => ({ createServerClient }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("proxy (middleware)", () => {
  it("skips Supabase entirely when using the local dev provider (placeholder URL)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://your-project.supabase.co";

    const request = new NextRequest("http://localhost:3000/discover");
    const response = await proxy(request);

    expect(createServerClient).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(response.cookies.get("rvm_session")?.value).toBeTruthy(); // anonymous session still minted
  });

  it("refreshes the Supabase session and propagates refreshed cookies when configured for production", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://real-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const request = new NextRequest("http://localhost:3000/discover");
    const response = await proxy(request);

    expect(createServerClient).toHaveBeenCalledTimes(1);
    // getUser() is what actually performs the refresh-token exchange - the
    // whole point of this middleware pass is that it gets called on every
    // request for a real Supabase-backed session, not just on sign-in.
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(response.cookies.get("sb-test-project-auth-token")?.value).toBe("refreshed-token-value");
    expect(response.cookies.get("rvm_session")?.value).toBeTruthy(); // both concerns run together
  });

  it("does not mint a second anonymous session cookie when one already exists", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://your-project.supabase.co";

    const request = new NextRequest("http://localhost:3000/discover", {
      headers: { cookie: "rvm_session=existing-session-id" },
    });
    const response = await proxy(request);

    expect(response.cookies.get("rvm_session")).toBeUndefined(); // not re-set - already present on the request
  });
});
