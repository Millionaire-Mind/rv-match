import "server-only";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import postgres from "postgres";

import { db } from "@/server/db/client";
import { profiles } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
} from "./session-cookie";

/**
 * Local development auth provider: real bcrypt password hashing and a
 * signed session cookie, backed by the `auth.users` stub table created by
 * scripts/local-dev/supabase-stub.sql (never applied to a real Supabase
 * project — see that file's header comment). This exists so the full
 * signup -> login -> dealer/admin/consumer flows can run and be tested in
 * environments without Docker or a hosted Supabase project. Swap to
 * `supabase-provider.ts` in production by setting real
 * NEXT_PUBLIC_SUPABASE_URL / keys — see ARCHITECTURE.md.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export class AuthError extends Error {}

export async function localSignUp(params: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<{ userId: string }> {
  const email = params.email.trim().toLowerCase();

  const existing = await sql`select id from auth.users where email = ${email}`;
  if (existing.length > 0) {
    throw new AuthError("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(params.password, 10);

  const [user] = await sql<{ id: string }[]>`
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values (${email}, ${passwordHash}, ${sql.json({ full_name: params.fullName ?? null })})
    returning id
  `;

  // The on_auth_user_created trigger (same trigger a real Supabase project
  // runs) has already inserted the matching public.profiles row.
  await setSessionCookie(user.id);
  return { userId: user.id };
}

export async function localSignIn(params: {
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const email = params.email.trim().toLowerCase();
  const [user] = await sql<{ id: string; encrypted_password: string }[]>`
    select id, encrypted_password from auth.users where email = ${email}
  `;
  if (!user) {
    throw new AuthError("Invalid email or password.");
  }
  const valid = await bcrypt.compare(params.password, user.encrypted_password);
  if (!valid) {
    throw new AuthError("Invalid email or password.");
  }
  await setSessionCookie(user.id);
  return { userId: user.id };
}

export async function localSignOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function localGetUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function localGetOrCreateProfileForUserId(userId: string) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return profile ?? null;
}

async function setSessionCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}
