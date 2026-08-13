"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitLead, type LeadFormState } from "@/server/leads/actions";
import { brand } from "@/config/brand";

type CtaType =
  | "check_availability"
  | "ask_question"
  | "request_best_price"
  | "schedule_walkthrough"
  | "estimate_trade"
  | "financing_info";

interface LeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventoryId: string;
  ctaType: CtaType;
  title: string;
  description: string;
}

const initialState: LeadFormState = { ok: false, error: "" };

export function LeadDialog({
  open,
  onOpenChange,
  inventoryId,
  ctaType,
  title,
  description,
}: LeadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed by `open` so each time the dialog is (re)opened it mounts a
            fresh form with fresh action state, instead of syncing state via
            effects. */}
        <LeadDialogBody
          key={String(open)}
          inventoryId={inventoryId}
          ctaType={ctaType}
          title={title}
          description={description}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LeadDialogBody({
  inventoryId,
  ctaType,
  title,
  description,
  onDone,
}: {
  inventoryId: string;
  ctaType: CtaType;
  title: string;
  description: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(submitLead, initialState);

  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="h-6 w-6" />
        </div>
        <DialogTitle>Request sent</DialogTitle>
        <p className="text-sm text-muted-foreground">
          The dealer has received your request and will reach out using your preferred contact
          method. Thanks for using {brand.name}.
        </p>
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="inventoryId" value={inventoryId} />
        <input type="hidden" name="ctaType" value={ctaType} />
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden
        />

        <div className="space-y-2">
          <Label htmlFor="lead-name">Name</Label>
          <Input id="lead-name" name="name" required maxLength={200} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="lead-email">Email</Label>
            <Input id="lead-email" name="email" type="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-phone">Phone</Label>
            <Input id="lead-phone" name="phone" type="tel" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Preferred contact method</Label>
          <RadioGroup defaultValue="email" name="preferredContact" className="flex gap-4">
            {(["email", "phone", "text"] as const).map((method) => (
              <div key={method} className="flex items-center gap-2">
                <RadioGroupItem value={method} id={`contact-${method}`} />
                <Label htmlFor={`contact-${method}`} className="font-normal capitalize">
                  {method}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-message">Message (optional)</Label>
          <Textarea id="lead-message" name="message" rows={3} maxLength={2000} />
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="lead-consent" name="consent" className="mt-0.5" />
          <Label htmlFor="lead-consent" className="font-normal text-sm leading-snug">
            I agree to be contacted by this dealership about this RV.
          </Label>
        </div>

        {!state.ok && state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={pending}>
            {pending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
