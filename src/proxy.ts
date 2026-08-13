import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { ANONYMOUS_COOKIE_NAME } from "@/server/auth/session-cookie";

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

function ensureAnonymousSession(request: NextRequest, response: NextResponse): void {
  if (request.cookies.get(ANONYMOUS_COOKIE_NAME)?.value) return;
  response.cookies.set(ANONYMOUS_COOKIE_NAME, crypto.randomUUID(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
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
    ensureAnonymousSession(request, response);
    return response;
  }

  const response = NextResponse.next();
  ensureAnonymousSession(request, response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|media/|manifest.webmanifest).*)"],
};
