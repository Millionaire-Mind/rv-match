import { describe, expect, it } from "vitest";

import { assertPublicFeedUrl } from "./fetch-feed";

describe("assertPublicFeedUrl (SSRF guard)", () => {
  it("accepts a normal public https URL", () => {
    expect(() => assertPublicFeedUrl("https://example.com/inventory.csv")).not.toThrow();
  });

  it("rejects localhost", () => {
    expect(() => assertPublicFeedUrl("http://localhost:5432/feed")).toThrow();
  });

  it("rejects loopback IPs", () => {
    expect(() => assertPublicFeedUrl("http://127.0.0.1/feed")).toThrow();
  });

  it("rejects RFC1918 private ranges", () => {
    expect(() => assertPublicFeedUrl("http://10.0.0.5/feed")).toThrow();
    expect(() => assertPublicFeedUrl("http://172.16.0.5/feed")).toThrow();
    expect(() => assertPublicFeedUrl("http://192.168.1.5/feed")).toThrow();
  });

  it("rejects link-local addresses (e.g. cloud metadata endpoints)", () => {
    expect(() => assertPublicFeedUrl("http://169.254.169.254/latest/meta-data")).toThrow();
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => assertPublicFeedUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicFeedUrl("ftp://example.com/feed")).toThrow();
  });

  it("rejects a malformed URL", () => {
    expect(() => assertPublicFeedUrl("not a url")).toThrow();
  });

  it("does not reject a public IP that merely resembles a private one in a different octet position", () => {
    expect(() => assertPublicFeedUrl("http://192.169.1.5/feed")).not.toThrow();
  });
});
