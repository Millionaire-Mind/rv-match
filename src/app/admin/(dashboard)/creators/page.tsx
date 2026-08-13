import type { Metadata } from "next";

import { listCreators } from "@/server/admin/creator-actions";
import { CreatorManagement } from "@/components/admin/creator-management";

export const metadata: Metadata = { title: "Creators" };
export const dynamic = "force-dynamic";

export default async function AdminCreatorsPage() {
  const creators = await listCreators();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Creators</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lightweight creator/influencer referral tracking - identity and campaign links only, no
          payment processing.
        </p>
      </div>
      <CreatorManagement
        creators={creators.map((c) => ({ id: c.id, name: c.name, contactEmail: c.contactEmail, active: c.active }))}
        appUrl={appUrl}
      />
    </div>
  );
}
