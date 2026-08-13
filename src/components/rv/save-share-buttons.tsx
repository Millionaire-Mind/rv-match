"use client";

import { useState, useTransition } from "react";
import { Bookmark, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toggleSaveInventory } from "@/server/discovery/actions";
import { brand } from "@/config/brand";

export function SaveShareButtons({
  inventoryId,
  initialSaved,
  title,
}: {
  inventoryId: string;
  initialSaved: boolean;
  title: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function handleSave() {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      await toggleSaveInventory(inventoryId, next);
    });
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} · ${brand.name}`, url });
      } catch {
        // user cancelled share sheet — not an error
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={handleSave} disabled={pending} className="flex-1">
        <Bookmark className={saved ? "fill-current" : ""} />
        {saved ? "Saved" : "Save"}
      </Button>
      <Button variant="outline" onClick={handleShare} className="flex-1">
        <Share2 />
        {copied ? "Link copied" : "Share"}
      </Button>
    </div>
  );
}
