import { NextResponse, type NextRequest } from "next/server";

import { ANONYMOUS_COOKIE_NAME } from "@/server/auth/session-cookie";

/**
 * Ensures every visitor has an anonymous session cookie before any page or
 * server action runs. Cookies can only be *set* from middleware, a Server
 * Action, or a Route Handler — not during a Server Component render — so
 * this is where the zero-friction anonymous session id is minted. The
 * matching `anonymous_sessions` database row is created lazily on first
 * use (see src/server/auth/anonymous.ts), since that's a plain data write
 * and is safe from a Server Component.
 */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(ANONYMOUS_COOKIE_NAME)?.value;
  if (existing) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(ANONYMOUS_COOKIE_NAME, crypto.randomUUID(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|media/|manifest.webmanifest).*)"],
};
