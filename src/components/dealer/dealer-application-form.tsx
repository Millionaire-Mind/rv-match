"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  submitDealerApplication,
  type DealerApplicationState,
} from "@/server/dealer/application-actions";

const initialState: DealerApplicationState = { ok: false, error: "" };

export function DealerApplicationForm() {
  const [state, formAction, pending] = useActionState(submitDealerApplication, initialState);

  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <p className="font-medium">Application submitted</p>
        <p className="text-sm text-muted-foreground">
          We&apos;ll review your dealership and email you once it&apos;s approved. You can sign in
          any time — your dashboard will show &quot;pending approval&quot; until then.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="dealershipName">Dealership name</Label>
        <Input id="dealershipName" name="dealershipName" required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressLine1">Address</Label>
        <Input id="addressLine1" name="addressLine1" required maxLength={200} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input id="state" name="state" maxLength={2} required placeholder="CO" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zipCode">ZIP</Label>
          <Input id="zipCode" name="zipCode" required maxLength={5} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website (optional)</Label>
          <Input id="website" name="website" type="url" placeholder="https://" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="facebookUrl">Facebook (optional)</Label>
          <Input id="facebookUrl" name="facebookUrl" type="url" placeholder="https://facebook.com/..." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="instagramUrl">Instagram (optional)</Label>
          <Input id="instagramUrl" name="instagramUrl" type="url" placeholder="https://instagram.com/..." />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="primaryContactName">Primary contact</Label>
          <Input id="primaryContactName" name="primaryContactName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventorySizeEstimate">Approx. inventory size</Label>
          <Input id="inventorySizeEstimate" name="inventorySizeEstimate" type="number" min={0} />
        </div>
      </div>

      <hr className="border-border" />
      <p className="text-sm font-medium">Create your login</p>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox id="agreement" name="agreement" className="mt-0.5" />
        <Label htmlFor="agreement" className="font-normal text-sm leading-snug">
          I agree to the RV Match Dealer Agreement and Terms of Service.
        </Label>
      </div>

      {!state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
        {pending ? "Submitting…" : "Submit Application"}
      </Button>
    </form>
  );
}
