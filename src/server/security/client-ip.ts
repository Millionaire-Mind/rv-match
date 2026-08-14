import "server-only";

import { headers } from "next/headers";

/**
 * The only client-IP source this app trusts: a header our own reverse
 * proxy sets from the actual TCP peer address on every request (see
 * deploy/nginx.conf's `proxy_set_header X-Real-IP $remote_addr;`),
 * overwriting anything a client tries to send. A bare `X-Forwarded-For` is
 * deliberately NOT read here - without a proxy that strips/overwrites it,
 * a client can set that header to anything and spoof rate-limit buckets
 * (or worse, another user's bucket, to lock them out).
 */
const TRUSTED_IP_HEADER = "x-real-ip";

export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const ip = headersList.get(TRUSTED_IP_HEADER);
  // Local dev has no reverse proxy in front, so this header is expected to
  // be absent there - fall back to one fixed key so rate limiting still
  // functions (as a single shared dev-only bucket) rather than silently
  // no-opping.
  return ip?.trim() || "unknown";
}
