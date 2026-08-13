"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { uploadInventoryPhotos } from "@/server/dealer/inventory-actions";

export function PhotoUploader({ dealershipId, inventoryId }: { dealershipId: string; inventoryId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append("photos", file);
    setError(null);

    startTransition(async () => {
      const result = await uploadInventoryPhotos(dealershipId, inventoryId, formData);
      if (!result.ok) setError(result.error ?? "Upload failed.");
      router.refresh();
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        id="photo-upload"
        onChange={handleChange}
      />
      <Button asChild variant="outline" disabled={pending}>
        <label htmlFor="photo-upload" className="cursor-pointer">
          <Upload className="h-4 w-4" />
          {pending ? "Uploading…" : "Upload Photos"}
        </label>
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
