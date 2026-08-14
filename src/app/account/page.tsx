import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { getEmailOptOut, getPendingDeletionRequest } from "@/server/account/privacy-actions";
import { AccountPrivacyPanel } from "@/components/account/account-privacy-panel";

export const metadata: Metadata = { title: "Account & Privacy" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [emailOptOut, pendingDeletion] = await Promise.all([getEmailOptOut(), getPendingDeletionRequest()]);

  return (
    <main className="min-h-dvh bg-background px-4 py-4 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/discover"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Back to discovery"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Account & Privacy</h1>
      </div>

      <div className="mx-auto max-w-lg">
        <AccountPrivacyPanel initialEmailOptOut={emailOptOut} initialPendingDeletion={pendingDeletion} />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="underline">
            Terms of Service
          </Link>
        </p>
      </div>
    </main>
  );
}
