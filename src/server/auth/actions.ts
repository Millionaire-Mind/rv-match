"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { consumerProfiles, dealershipUsers, profiles } from "@/server/db/schema";
import { signInSchema, signUpSchema } from "@/server/validation/auth";
import { authSignIn, authSignOut, authSignUp, AuthError } from "./provider";
import { getOrCreateAnonymousSessionId } from "./anonymous";

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

  let userId: string;
  try {
    const result = await authSignUp(parsed.data);
    userId = result.userId;
  } catch (err) {
    return { error: err instanceof AuthError ? err.message : "Could not create your account." };
  }

  await mergeAnonymousHistory(userId);
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

  let userId: string;
  try {
    const result = await authSignIn(parsed.data);
    userId = result.userId;
  } catch (err) {
    return { error: err instanceof AuthError ? err.message : "Invalid email or password." };
  }

  await mergeAnonymousHistory(userId);
  const destination = await resolvePostLoginDestination(userId);
  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  await authSignOut();
  redirect("/");
}
