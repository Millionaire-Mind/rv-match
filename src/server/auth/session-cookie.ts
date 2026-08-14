import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is not set (or too short). Set a long random string in .env.local.",
    );
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

/**
 * Signs a minimal session token (`{sub, iat, exp}`) with HMAC-SHA256. Used
 * by the local development auth provider so RV Match is fully testable
 * without a hosted Supabase project. The production Supabase provider does
 * not use this — Supabase Auth manages its own session cookies.
 */
export function signSessionToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub: userId, iat: now, exp: now + SESSION_MAX_AGE_SECONDS };
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(signature)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = createHmac("sha256", getSecret()).update(payloadB64).digest();
  const providedSig = Buffer.from(sigB64, "base64url");
  if (
    expectedSig.length !== providedSig.length ||
    !timingSafeEqual(expectedSig, providedSig)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "rvm_auth";
export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;
export const ANONYMOUS_COOKIE_NAME = "rvm_session";

/**
 * Short-lived, set by middleware only on a visitor's very first request
 * (alongside the anonymous session cookie) when that request carries UTM
 * parameters or a third-party Referer - carries the classified source plus
 * the raw UTM values forward to the first Server Component/Action that
 * actually creates the anonymous_sessions row, since middleware itself
 * can't write to Postgres (see src/proxy.ts). Never read after that first
 * row exists - getOrCreateAnonymousSessionId's onConflictDoUpdate already
 * ignores firstSource on every later call, so a stale copy of this cookie
 * lingering past its own expiry is harmless.
 */
export const PENDING_ATTRIBUTION_COOKIE_NAME = "rvm_pending_attr";
export const PENDING_ATTRIBUTION_COOKIE_MAX_AGE = 60 * 10; // 10 minutes
