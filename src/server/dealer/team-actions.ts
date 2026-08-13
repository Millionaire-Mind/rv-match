"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { dealerships, dealershipUsers, profiles } from "@/server/db/schema";
import { requireDealerRole } from "@/server/auth/guards";
import { authSignUp, AuthError } from "@/server/auth/provider";
import { OWNER_ONLY } from "@/server/dealer/permissions";
import { dealerRoleLabels, dealerRoleSchema } from "@/server/validation/enums";
import { sendMail } from "@/server/email/mailer";
import { logAudit } from "@/server/audit/log";

export type TeamActionState = { ok: false; error: string } | { ok: true };

function generateTempPassword(): string {
  // 12 random bytes -> 16 base64url chars; meets any reasonable minimum
  // length/entropy requirement and is only ever used once (the recipient
  // is expected to sign in and isn't shown a "change your password" flow
  // in this V1, so this doubles as their password until they choose to
  // sign in and use forgot-password style account recovery when that
  // exists in a future pass).
  return randomBytes(12).toString("base64url");
}

async function countActiveOwners(dealershipId: string, excludingMembershipId?: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(dealershipUsers)
    .where(
      and(
        eq(dealershipUsers.dealershipId, dealershipId),
        eq(dealershipUsers.role, "owner"),
        eq(dealershipUsers.active, true),
        excludingMembershipId ? ne(dealershipUsers.id, excludingMembershipId) : undefined,
      ),
    );
  return row?.n ?? 0;
}

const inviteSchema = z.object({
  email: z.email(),
  fullName: z.string().min(1, "Name is required.").max(200),
  role: dealerRoleSchema,
});

/**
 * Adds a team member to the dealership. If they already have an RV Match
 * account (matched by email), they're simply attached with the chosen
 * role. Otherwise a new account is created with a system-generated
 * temporary password, emailed to them (via the same dev-mail-fallback
 * transport lead notifications use, so nothing is silently dropped in an
 * environment without SMTP configured).
 */
export async function inviteDealerUser(dealershipId: string, formData: FormData): Promise<TeamActionState> {
  const { userId: inviterId } = await requireDealerRole(dealershipId, OWNER_ONLY);

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const { email, fullName, role } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const [dealership] = await db.select({ name: dealerships.name }).from(dealerships).where(eq(dealerships.id, dealershipId)).limit(1);
  if (!dealership) return { ok: false, error: "Dealership not found." };

  const [existingProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, normalizedEmail))
    .limit(1);

  let targetUserId: string;
  let tempPassword: string | null = null;

  if (existingProfile) {
    const [already] = await db
      .select({ id: dealershipUsers.id })
      .from(dealershipUsers)
      .where(and(eq(dealershipUsers.dealershipId, dealershipId), eq(dealershipUsers.userId, existingProfile.id)))
      .limit(1);
    if (already) return { ok: false, error: "This person is already on your team." };
    targetUserId = existingProfile.id;
  } else {
    tempPassword = generateTempPassword();
    try {
      const result = await authSignUp({ email: normalizedEmail, password: tempPassword, fullName });
      targetUserId = result.userId;
    } catch (err) {
      return { ok: false, error: err instanceof AuthError ? err.message : "Could not create an account for this email." };
    }
  }

  await db.insert(dealershipUsers).values({ dealershipId, userId: targetUserId, role, invitedBy: inviterId });

  const loginNote = tempPassword
    ? `<p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Sign in at the dealer login page and you're in.</p>`
    : `<p>Sign in with your existing RV Match account to access it.</p>`;
  await sendMail({
    to: normalizedEmail,
    subject: `You've been added to ${dealership.name} on RV Match`,
    html: `<p>You've been added to <strong>${dealership.name}</strong> on RV Match as a <strong>${dealerRoleLabels[role]}</strong>.</p>${loginNote}`,
    text: `You've been added to ${dealership.name} on RV Match as a ${dealerRoleLabels[role]}. ${
      tempPassword ? `Temporary password: ${tempPassword}` : "Sign in with your existing RV Match account."
    }`,
  });

  await logAudit({
    action: "dealer.team.invite",
    entityType: "dealership_users",
    entityId: targetUserId,
    dealershipId,
    metadata: { role, createdNewAccount: !existingProfile },
  });
  revalidatePath("/dealer/team");
  return { ok: true };
}

export async function updateDealerUserRole(
  dealershipId: string,
  membershipId: string,
  role: z.infer<typeof dealerRoleSchema>,
): Promise<TeamActionState> {
  await requireDealerRole(dealershipId, OWNER_ONLY);

  const [membership] = await db
    .select({ id: dealershipUsers.id, role: dealershipUsers.role, active: dealershipUsers.active })
    .from(dealershipUsers)
    .where(and(eq(dealershipUsers.id, membershipId), eq(dealershipUsers.dealershipId, dealershipId)))
    .limit(1);
  if (!membership) return { ok: false, error: "Team member not found." };

  if (membership.role === "owner" && role !== "owner" && membership.active) {
    const remainingOwners = await countActiveOwners(dealershipId, membershipId);
    if (remainingOwners === 0) {
      return { ok: false, error: "A dealership must have at least one active Owner/Admin." };
    }
  }

  await db.update(dealershipUsers).set({ role }).where(eq(dealershipUsers.id, membershipId));
  await logAudit({
    action: "dealer.team.role_change",
    entityType: "dealership_users",
    entityId: membershipId,
    dealershipId,
    metadata: { from: membership.role, to: role },
  });
  revalidatePath("/dealer/team");
  return { ok: true };
}

export async function setDealerUserActive(
  dealershipId: string,
  membershipId: string,
  active: boolean,
): Promise<TeamActionState> {
  await requireDealerRole(dealershipId, OWNER_ONLY);

  const [membership] = await db
    .select({ id: dealershipUsers.id, role: dealershipUsers.role, active: dealershipUsers.active })
    .from(dealershipUsers)
    .where(and(eq(dealershipUsers.id, membershipId), eq(dealershipUsers.dealershipId, dealershipId)))
    .limit(1);
  if (!membership) return { ok: false, error: "Team member not found." };

  if (!active && membership.role === "owner" && membership.active) {
    const remainingOwners = await countActiveOwners(dealershipId, membershipId);
    if (remainingOwners === 0) {
      return { ok: false, error: "A dealership must have at least one active Owner/Admin." };
    }
  }

  await db.update(dealershipUsers).set({ active }).where(eq(dealershipUsers.id, membershipId));
  await logAudit({
    action: active ? "dealer.team.reactivate" : "dealer.team.deactivate",
    entityType: "dealership_users",
    entityId: membershipId,
    dealershipId,
  });
  revalidatePath("/dealer/team");
  return { ok: true };
}
