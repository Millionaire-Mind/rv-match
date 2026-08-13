const MAX_FEED_BYTES = 20 * 1024 * 1024; // 20MB - generous for a dealer inventory feed, bounded against abuse
const FETCH_TIMEOUT_MS = 20_000;

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fc00:/i,
  /^\[?fe80:/i,
];

/**
 * A feed URL is dealer-supplied, and this server fetches it - a classic
 * SSRF surface (a malicious or compromised dealer account could otherwise
 * use "add a feed source" to probe internal network services). Rejects
 * obviously-private/loopback hostnames before ever making the request.
 * Not a complete defense (DNS rebinding could still resolve a public
 * hostname to a private IP after this check), but blocks the common case
 * cheaply.
 */
export function assertPublicFeedUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Feed URLs must use http or https.");
  }
  if (PRIVATE_HOSTNAME_PATTERNS.some((p) => p.test(url.hostname))) {
    throw new Error("Feed URLs must point to a public address.");
  }
  return url;
}

/** Fetches a feed URL with a timeout and a hard size cap, so one dealer's misconfigured or malicious feed URL can't hang or exhaust memory on a shared worker. */
export async function fetchFeedText(rawUrl: string): Promise<string> {
  const url = assertPublicFeedUrl(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      throw new Error(`Feed URL returned HTTP ${res.status}.`);
    }
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_FEED_BYTES) {
      throw new Error("Feed response is too large (over 20MB).");
    }
    if (!res.body) return await res.text();

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FEED_BYTES) {
        await reader.cancel();
        throw new Error("Feed response is too large (over 20MB).");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
  } finally {
    clearTimeout(timeout);
  }
}
