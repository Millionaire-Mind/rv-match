"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { consumerProfiles, dealershipUsers, profiles } from "@/server/db/schema";
import { signInSchema, signUpSchema } from "@/server/validation/auth";
import { authSignIn, authSignOut, authSignUp, AuthError } from "./provider";
import { getOrCreateAnonymousSessionId, resetAnonymousSessionForFreshStart } from "./anonymous";
import { checkRateLimit } from "@/server/security/rate-limit";
import { getClientIp } from "@/server/security/client-ip";
import { logError } from "@/server/logging/log";

export type AuthActionState = { error: string } | { error: null };

async function mergeAnonymousHistory(userId: string) {
  const anonymousSessionId = await getOrCreateAnonymousSessionId();
  const [existingForUser] = await db
    .select({ id: consumerProfiles.id })
    .from(consumerProfiles)
    .where(eq(consumerProfiles.userId, userId))
    .limit(1);
  if (existingForUser) return;

  const [anonProfile] = await db
    .select({ id: consumerProfiles.id })
    .from(consumerProfiles)
    .where(eq(consumerProfiles.anonymousSessionId, anonymousSessionId))
    .limit(1);

  if (anonProfile) {
    await db.update(consumerProfiles).set({ userId }).where(eq(consumerProfiles.id, anonProfile.id));
  }
}

async function resolvePostLoginDestination(userId: string): Promise<string> {
  const [profile] = await db
    .select({ platformRole: profiles.platformRole })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (profile?.platformRole === "platform_admin") return "/admin";

  const [dealerMembership] = await db
    .select({ dealershipId: dealershipUsers.dealershipId })
    .from(dealershipUsers)
    .where(eq(dealershipUsers.userId, userId))
    .limit(1);
  if (dealerMembership) return "/dealer";

  return "/saved";
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const ip = await getClientIp();
  if (!checkRateLimit(`signup-ip:${ip}`, 10, 60 * 60 * 1000)) {
    return { error: "Too many signup attempts. Please try again later." };
  }

  let userId: string;
  try {
    const result = await authSignUp(parsed.data);
    userId = result.userId;
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    logError("auth.signup", err);
    return { error: "Could not create your account." };
  }

  // Gap 12: an explicit choice, not a forced default - "fresh" rotates to
  // a brand-new anonymous session so no prior shopping history attaches;
  // anything else (including a missing/unrecognized value) keeps the
  // existing merge-in behavior, matching how this worked before the choice
  // existed.
  if (formData.get("historyChoice") === "fresh") {
    await resetAnonymousSessionForFreshStart();
  } else {
    await mergeAnonymousHistory(userId);
  }
  const destination = await resolvePostLoginDestination(userId);
  redirect(destination);
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  // Both an IP-keyed and an email-keyed bucket: IP alone lets an attacker
  // spread one account's guesses across many source addresses to stay
  // under the limit; email alone lets a botnet brute-force many accounts
  // from many IPs. Neither is spoofable here - the IP comes from
  // getClientIp's trusted-proxy header, and the email is only ever used as
  // an opaque bucket key, never trusted as an identity claim on its own.
  const ip = await getClientIp();
  if (!checkRateLimit(`login-ip:${ip}`, 20, 15 * 60 * 1000) || !checkRateLimit(`login-email:${parsed.data.email.trim().toLowerCase()}`, 10, 15 * 60 * 1000)) {
    return { error: "Too many login attempts. Please try again in a few minutes." };
  }

  let userId: string;
  try {
    const result = await authSignIn(parsed.data);
    userId = result.userId;
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    logError("auth.signin", err);
    return { error: "Invalid email or password." };
  }

  await mergeAnonymousHistory(userId);
  const destination = await resolvePostLoginDestination(userId);
  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  await authSignOut();
  redirect("/");
}
