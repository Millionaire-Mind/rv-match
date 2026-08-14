import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Privacy Policy" };

const LAST_UPDATED = "August 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-4 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary" aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Privacy Policy</h1>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 pb-16 text-sm leading-relaxed text-foreground/90">
        <p className="text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">What {brand.name} is</h2>
          <p>
            {brand.name} is a referral service that connects RV shoppers with independent RV dealerships. We learn
            what you&apos;re looking for by how you respond to short RV videos, then show you matching RVs and, if
            you choose, connect you with the dealership that has one in stock. {brand.legalEntityName} does not sell
            RVs directly, is not a party to any purchase, and does not process payments for a vehicle sale.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">What we collect</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>Browsing/matching activity:</strong> which RVs you watch, like, pass on, or save, and how long
              you watch each video. This is what powers your matches - it isn&apos;t sold or shared with advertisers.
            </li>
            <li>
              <strong>Location:</strong> a ZIP code you provide, used only to estimate distance to dealerships and
              filter results to a radius you set. We don&apos;t collect precise GPS location.
            </li>
            <li>
              <strong>Account information:</strong> if you create an account, your email and (optionally) name.
            </li>
            <li>
              <strong>Lead information:</strong> if you contact a dealer through {brand.name} (e.g. &quot;Check
              Availability&quot; or &quot;Request Best Price&quot;), the name, email, phone, and message you provide
              are shared with that dealership so they can respond to you.
            </li>
            <li>
              <strong>A single session cookie:</strong> used to recognize you as the same shopper across visits, even
              before you create an account. We don&apos;t use third-party advertising or tracking cookies.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">How dealers see your activity</h2>
          <p>
            When you contact a dealership, that specific dealership can see how you&apos;ve responded to{" "}
            <em>their own</em> inventory (which of their RVs you&apos;ve liked, passed on, or saved) so they can help
            you better. A dealership never sees how you&apos;ve behaved on a competing dealership&apos;s listings, or
            which brands you&apos;ve been favoring elsewhere on the platform.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">What we don&apos;t do</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>We don&apos;t sell your personal information to third parties.</li>
            <li>We don&apos;t run third-party advertising trackers or ad-retargeting pixels on this site.</li>
            <li>We don&apos;t use a chatbot or AI system to make purchase decisions on your behalf.</li>
            <li>{brand.name} is not intended for use by children under 18.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Your rights</h2>
          <p>
            You can download a copy of everything tied to your account, opt out of email notifications, or request
            that your account and data be deleted, at any time from your{" "}
            <Link href="/account" className="underline">
              Account &amp; Privacy
            </Link>{" "}
            page. Account deletion is reviewed by our team rather than instant, since a dealer you&apos;ve contacted
            may have a legitimate business reason to retain the lead you submitted to them even after your shopper
            profile is deleted.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Contact</h2>
          <p>
            Questions about this policy or your data can be sent to{" "}
            <a href={`mailto:${brand.supportEmail}`} className="underline">
              {brand.supportEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
