import type { Metadata } from "next";
import Link from "next/link";

import { brand } from "@/config/brand";
import { DealerApplicationForm } from "@/components/dealer/dealer-application-form";

export const metadata: Metadata = { title: "Apply as a Dealer" };

export default function DealerApplyPage() {
  return (
    <main className="min-h-dvh bg-secondary/30 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="mb-6 inline-block text-lg font-semibold">
          {brand.name} <span className="text-muted-foreground font-normal">for Dealers</span>
        </Link>
        <h1 className="text-2xl font-semibold">Become a Founding Dealer</h1>
        <p className="mt-2 text-muted-foreground">
          Free for 90 days or your first 3 verified sales, whichever comes first. An RV Match admin
          reviews every application before your dealership goes live.
        </p>
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <DealerApplicationForm />
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already approved? <Link href="/dealer/login" className="text-accent underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
