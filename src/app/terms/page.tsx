import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Terms of Service" };

const LAST_UPDATED = "August 2026";

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-4 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary" aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Terms of Service</h1>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 pb-16 text-sm leading-relaxed text-foreground/90">
        <p className="text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">The service</h2>
          <p>
            {brand.name} is a matching and referral service operated by {brand.legalEntityName}. We help you find RVs
            that fit your preferences and, if you choose to reach out, connect you with an independent dealership
            that has that RV in stock. {brand.name} is not a dealer, does not own or sell any RV shown on the
            platform, and is not a party to any sale, financing, trade-in, or service agreement between you and a
            dealership.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">No warranty on listings</h2>
          <p>
            Inventory, pricing, and availability shown on {brand.name} are supplied by participating dealerships and
            can change or be inaccurate. Always confirm price, availability, and RV condition directly with the
            dealership before making any purchase decision. {brand.name} makes no representation about the
            condition, safety, or fitness of any RV listed.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Your account</h2>
          <p>
            You&apos;re responsible for the accuracy of the information you provide, including contact details you
            submit to a dealership through a lead form. Don&apos;t use {brand.name} to submit false contact
            information or to harass a dealership or another user.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Dealer accounts</h2>
          <p>
            Dealerships using {brand.name} to list inventory are responsible for the accuracy of their own listings
            and for responding to leads in a timely, professional manner. A dealership&apos;s access can be
            suspended for inaccurate listings, unresponsiveness, or misuse of shopper contact information.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Changes</h2>
          <p>
            We may update these terms as the service evolves. Continued use of {brand.name} after a change means you
            accept the updated terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Contact</h2>
          <p>
            Questions about these terms can be sent to{" "}
            <a href={`mailto:${brand.supportEmail}`} className="underline">
              {brand.supportEmail}
            </a>
            . See also our{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
