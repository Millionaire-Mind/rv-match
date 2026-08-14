import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  ANONYMOUS_COOKIE_NAME,
  PENDING_ATTRIBUTION_COOKIE_MAX_AGE,
  PENDING_ATTRIBUTION_COOKIE_NAME,
} from "@/server/auth/session-cookie";
import { classifyOrganicSource } from "@/server/attribution/source";

/**
 * Two independent responsibilities live here:
 *
 * 1. Anonymous session cookie (always). Cookies can only be *set* from
 *    middleware, a Server Action, or a Route Handler — never a Server
 *    Component render — so this is where the zero-friction anonymous
 *    session id is minted. The matching `anonymous_sessions` database row
 *    is created lazily on first use (see src/server/auth/anonymous.ts).
 *
 * 2. Supabase Auth session refresh (production only, when real Supabase
 *    credentials are configured). This is the documented @supabase/ssr
 *    middleware pattern. Supabase access tokens expire (~1 hour default);
 *    without refreshing them here on every request, a signed-in user's
 *    session silently breaks server-side once the access token expires,
 *    even though they hold a valid refresh token — Server
 *    Components/Actions can only *read* cookies, they can't write a
 *    refreshed one back mid-render. `supabase.auth.getUser()` is what
 *    actually triggers the refresh-token exchange when the access token is
 *    stale; do not add logic between `createServerClient` and that call.
 *
 * This only runs against a real Supabase project (`usesRealSupabase()`
 * below, kept in sync with src/server/auth/provider.ts's check of the same
 * name). The local HMAC dev provider (src/server/auth/local-provider.ts)
 * has no token-expiry concept and doesn't need it — and deliberately isn't
 * imported here even indirectly, since it opens a raw Postgres TCP
 * connection at module scope, which the Edge runtime middleware executes in
 * cannot support.
 */
function usesRealSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(url && !url.includes("your-project"));
}

/**
 * On a first-time visitor, this must both (a) set the cookie the browser
 * will carry from now on, and (b) make that same id visible to `cookies()`
 * reads *within this same request* - a Route Handler (e.g. src/app/go/
 * [code]/route.ts, which mints the anonymous_sessions DB row immediately,
 * before any redirect) only ever sees the incoming request's cookies, not
 * whatever this middleware writes onto its own response object. Writing
 * only to `response.cookies` (the original implementation) left the two
 * out of sync on a visitor's very first request: the id in the DB row
 * created during that request and the id the browser actually ends up
 * storing would silently differ, orphaning the DB row this request wrote
 * to (breaking first-touch attribution for exactly the case - a fresh QR
 * scan - it exists to capture). Mutating `request.cookies` and rebuilding
 * the response from that mutated request (mirroring the already-correct
 * @supabase/ssr pattern in refreshSupabaseSession below) keeps both
 * in sync, the same way Server Component renders already behaved
 * correctly without this fix.
 */
/**
 * Classifies this first-ever request's UTM params / Referer into a
 * first-touch source bucket, when there's anything to classify - a
 * /go/[code] visit (which has its own, more specific campaign-based
 * attribution) or a bare visit with no UTM tags and no third-party
 * referrer both correctly produce nothing here, leaving
 * getOrCreateAnonymousSessionId to fall back to its "direct" schema
 * default rather than writing a redundant pending-attribution cookie.
 */
function capturePendingAttribution(request: NextRequest): string | null {
  const params = request.nextUrl.searchParams;
  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");
  const utmCampaign = params.get("utm_campaign");
  const utmContent = params.get("utm_content");
  const utmTerm = params.get("utm_term");

  let referrerHost: string | null = null;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      referrerHost = new URL(referer).host;
    } catch {
      referrerHost = null;
    }
  }

  if (!utmSource && !utmMedium && !utmCampaign && !referrerHost) return null;

  const source = classifyOrganicSource({
    utmSource,
    utmMedium,
    referrerHost,
    appHost: request.nextUrl.host,
  });

  return JSON.stringify({ source, utmSource, utmMedium, utmCampaign, utmContent, utmTerm });
}

function ensureAnonymousSession(request: NextRequest, response: NextResponse): NextResponse {
  if (request.cookies.get(ANONYMOUS_COOKIE_NAME)?.value) return response;

  const id = crypto.randomUUID();
  const pendingAttribution = capturePendingAttribution(request);
  request.cookies.set(ANONYMOUS_COOKIE_NAME, id);
  // NextResponse.next({ request }) builds a fresh response from the
  // mutated request - any cookies already set on the incoming `response`
  // (e.g. a refreshed Supabase auth cookie from refreshSupabaseSession)
  // have to be carried forward explicitly, or this would silently drop
  // them.
  const updated = NextResponse.next({ request });
  for (const cookie of response.cookies.getAll()) {
    updated.cookies.set(cookie);
  }
  if (pendingAttribution) {
    request.cookies.set(PENDING_ATTRIBUTION_COOKIE_NAME, pendingAttribution);
    updated.cookies.set(PENDING_ATTRIBUTION_COOKIE_NAME, pendingAttribution, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PENDING_ATTRIBUTION_COOKIE_MAX_AGE,
    });
  }
  updated.cookies.set(ANONYMOUS_COOKIE_NAME, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return updated;
}

async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export async function proxy(request: NextRequest) {
  if (usesRealSupabase()) {
    const response = await refreshSupabaseSession(request);
    return ensureAnonymousSession(request, response);
  }

  const response = NextResponse.next();
  return ensureAnonymousSession(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|media/|manifest.webmanifest).*)"],
};
