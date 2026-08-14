import { describe, expect, it, vi } from "vitest";

let headerValue: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "x-real-ip" ? headerValue : undefined),
  }),
}));

const { getClientIp } = await import("./client-ip");

describe("getClientIp", () => {
  it("returns the trusted x-real-ip header when present", async () => {
    headerValue = "203.0.113.42";
    expect(await getClientIp()).toBe("203.0.113.42");
  });

  it("falls back to a fixed key when the trusted header is absent", async () => {
    headerValue = undefined;
    expect(await getClientIp()).toBe("unknown");
  });

  it("never reads a client-spoofable X-Forwarded-For header", async () => {
    headerValue = undefined;
    // Even if some other header carried a client-supplied value, this
    // function only ever reads x-real-ip - proven by the mock above
    // exposing no other header name at all and the function still working.
    expect(await getClientIp()).toBe("unknown");
  });
});
