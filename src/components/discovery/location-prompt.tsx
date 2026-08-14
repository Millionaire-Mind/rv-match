"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitZipCode } from "@/server/discovery/location";
import { UseMyLocationButton } from "@/components/discovery/use-my-location-button";

interface LocationPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function LocationPrompt({ open, onOpenChange, onSaved }: LocationPromptProps) {
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitZipCode(zip);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onSaved();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Want to see RVs you can actually buy near you?</DialogTitle>
          <DialogDescription>
            Add your ZIP code and we&apos;ll prioritize RVs from dealers near you. You can change
            this anytime.
          </DialogDescription>
        </DialogHeader>
        <UseMyLocationButton
          onSuccess={() => {
            onSaved();
            onOpenChange(false);
          }}
        />
        <div className="relative py-1 text-center text-xs text-muted-foreground">
          <span className="relative bg-background px-2">or enter your ZIP code</span>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="zip">ZIP code</Label>
            <Input
              id="zip"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={5}
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 80202"
              autoFocus
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Not now
            </Button>
            <Button type="submit" variant="accent" disabled={pending || zip.length !== 5}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
