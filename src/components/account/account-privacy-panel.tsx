"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setEmailOptOut, requestAccountDeletion } from "@/server/account/privacy-actions";

interface AccountPrivacyPanelProps {
  initialEmailOptOut: boolean;
  initialPendingDeletion: boolean;
}

export function AccountPrivacyPanel({ initialEmailOptOut, initialPendingDeletion }: AccountPrivacyPanelProps) {
  const [emailOptOut, setEmailOptOutState] = useState(initialEmailOptOut);
  const [pendingDeletion, setPendingDeletion] = useState(initialPendingDeletion);
  const [pending, startTransition] = useTransition();

  function toggleEmail(checked: boolean) {
    setEmailOptOutState(!checked);
    startTransition(async () => {
      await setEmailOptOut(!checked);
    });
  }

  function requestDeletion() {
    startTransition(async () => {
      await requestAccountDeletion();
      setPendingDeletion(true);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-medium">Email notifications</h2>
        <div className="mt-3 flex items-center justify-between gap-4">
          <Label htmlFor="email-consent" className="font-normal text-sm text-muted-foreground">
            Email me about price drops, strong matches, and updates on RVs I&apos;ve saved.
          </Label>
          <Switch id="email-consent" checked={!emailOptOut} onCheckedChange={toggleEmail} disabled={pending} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          In-app notifications keep working either way - this only controls email.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-medium">Your data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download everything tied to your account: swipe history, saved RVs, leads you&apos;ve submitted, and
          notifications.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <a href="/api/account/export">Download My Data</a>
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-medium">Delete your account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently removes your profile, swipe history, saved RVs, and preferences. Reviewed by our team, not
          instant - any leads you&apos;ve submitted stay with the dealer you contacted.
        </p>
        {pendingDeletion ? (
          <p className="mt-3 text-sm font-medium text-warning">Deletion requested - we&apos;ll process it shortly.</p>
        ) : (
          <Button variant="outline" size="sm" className="mt-3" disabled={pending} onClick={requestDeletion}>
            Request Account Deletion
          </Button>
        )}
      </div>
    </div>
  );
}
