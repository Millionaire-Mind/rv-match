import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { profiles } from "@/server/db/schema";
import { authGetUserId } from "@/server/auth/provider";

export async function requireAdminContext(): Promise<{ userId: string }> {
  const userId = await authGetUserId();
  if (!userId) redirect("/admin/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (profile?.platformRole !== "platform_admin") redirect("/admin/login");

  return { userId };
}
