"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, RefreshCw, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  requestVideoGeneration,
  retryVideoGeneration,
  setPrimaryVideo,
  uploadInventoryVideo,
} from "@/server/dealer/inventory-actions";

interface VideoRow {
  id: string;
  url: string | null;
  source: "dealer_upload" | "generated";
  createdAt: Date;
}

interface JobRow {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  errorMessage: string | null;
}

export function VideoManager({
  dealershipId,
  inventoryId,
  videos,
  primaryVideoId,
  latestJob,
  hasPhotos,
}: {
  dealershipId: string;
  inventoryId: string;
  videos: VideoRow[];
  primaryVideoId: string | null;
  latestJob: JobRow | null;
  hasPhotos: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generation now always runs on a separate worker process (see
  // requestVideoGeneration), not inline in the request, so this page needs
  // to poll for the job to move past queued/processing on its own instead
  // of relying on a one-time router.refresh() after the request returns.
  const isWaitingOnWorker = latestJob?.status === "queued" || latestJob?.status === "processing";
  useEffect(() => {
    if (!isWaitingOnWorker) return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [isWaitingOnWorker, router]);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("video", file);
    setError(null);
    startTransition(async () => {
      const result = await uploadInventoryVideo(dealershipId, inventoryId, formData);
      if (!result.ok) setError(result.error ?? "Upload failed.");
      router.refresh();
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleGenerate() {
    startTransition(async () => {
      await requestVideoGeneration(dealershipId, inventoryId);
      router.refresh();
    });
  }

  function handleRetry(jobId: string) {
    startTransition(async () => {
      await retryVideoGeneration(dealershipId, jobId, inventoryId);
      router.refresh();
    });
  }

  function handleSetPrimary(videoId: string) {
    startTransition(async () => {
      await setPrimaryVideo(dealershipId, inventoryId, videoId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {videos.length === 0 && !latestJob && (
        <p className="text-sm text-muted-foreground">
          No video yet. Upload one, or generate an automatic vertical video from this RV&apos;s photos.
        </p>
      )}

      <div className="space-y-2">
        {videos.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <Play className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {v.source === "dealer_upload" ? "Dealer uploaded" : "Auto-generated"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.createdAt).toLocaleDateString()}
                </p>
              </div>
              {v.id === primaryVideoId && <Badge variant="accent">Primary</Badge>}
            </div>
            {v.id !== primaryVideoId && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => handleSetPrimary(v.id)}>
                Set as primary
              </Button>
            )}
          </div>
        ))}
      </div>

      {latestJob && latestJob.status !== "completed" && (
        <div className="rounded-lg border border-border p-3 text-sm">
          <div className="flex items-center justify-between">
            <span>
              Generation status: <Badge variant={latestJob.status === "failed" ? "warning" : "secondary"}>{latestJob.status}</Badge>
            </span>
            {latestJob.status === "failed" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => handleRetry(latestJob.id)}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            )}
          </div>
          {latestJob.errorMessage && (
            <p className="mt-1 text-xs text-destructive">{latestJob.errorMessage}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          id="video-upload"
          onChange={handleUpload}
        />
        <Button asChild variant="outline" disabled={pending}>
          <label htmlFor="video-upload" className="cursor-pointer">
            <Upload className="h-4 w-4" />
            Upload Video
          </label>
        </Button>
        <Button
          variant="outline"
          disabled={pending || !hasPhotos}
          onClick={handleGenerate}
          title={hasPhotos ? undefined : "Upload photos first"}
        >
          <RefreshCw className="h-4 w-4" />
          Generate Automatic Video
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
