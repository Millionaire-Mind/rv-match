import type { Metadata } from "next";
import Link from "next/link";

import { brand } from "@/config/brand";
import { Badge } from "@/components/ui/badge";
import { getDealerStatusContext } from "@/server/dealer/context";
import { signOutAction } from "@/server/auth/actions";

export const metadata: Metadata = { title: "Dealership Status" };

const STATUS_COPY: Record<string, { heading: string; body: string; variant: "secondary" | "warning" | "outline" }> = {
  pending: {
    heading: "Your application is under review",
    body: "An RV Match admin reviews every dealer application before your dealership can publish inventory and receive leads. We'll email you as soon as a decision is made — there's nothing else to do right now.",
    variant: "secondary",
  },
  suspended: {
    heading: "Your dealership has been suspended",
    body: "Your dealership's access to RV Match has been temporarily suspended. Your inventory is no longer visible to consumers and your team cannot make changes until this is resolved. Contact RV Match support for details.",
    variant: "warning",
  },
  rejected: {
    heading: "Your application was not approved",
    body: "Your dealer application was not approved to join RV Match at this time. Contact RV Match support if you believe this was in error or want more information.",
    variant: "outline",
  },
};

export default async function DealerPendingPage() {
  const { dealership } = await getDealerStatusContext();
  const copy = STATUS_COPY[dealership.status] ?? STATUS_COPY.pending;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary/30 px-4 py-10">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 text-center">
        <Link href="/" className="mb-6 inline-block text-lg font-semibold">
          {brand.name} <span className="text-muted-foreground font-normal">for Dealers</span>
        </Link>
        <Badge variant={copy.variant} className="mx-auto mb-4 w-fit capitalize">
          {dealership.status}
        </Badge>
        <h1 className="text-xl font-semibold">{copy.heading}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{copy.body}</p>
        <p className="mt-2 text-sm font-medium">{dealership.name}</p>
        <form action={signOutAction} className="mt-6">
          <button type="submit" className="text-sm text-accent underline underline-offset-2">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
