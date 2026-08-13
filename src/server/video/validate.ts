import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const FFPROBE_PATH = process.env.FFPROBE_PATH || "ffprobe";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

export interface VideoProbeResult {
  /** False if the file has no readable video stream at all - i.e. it isn't
   * actually a video regardless of what its declared MIME type/extension
   * claimed. Never trust a client-supplied content-type alone. */
  isValidVideo: boolean;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

interface FfprobeStream {
  width?: number;
  height?: number;
}
interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

/**
 * Inspects a video file's actual container/stream data via ffprobe -
 * the same real inspection tool the generation pipeline implicitly trusts
 * ffmpeg to have produced correctly. A file that fails to probe (corrupt,
 * not actually a video, a renamed non-video file) is rejected here before
 * it's ever stored or shown to a consumer.
 */
export async function probeVideoFile(filePath: string): Promise<VideoProbeResult> {
  try {
    const { stdout } = await run(
      FFPROBE_PATH,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:format=duration",
        "-of",
        "json",
        filePath,
      ],
      { maxBuffer: 1024 * 1024 * 8 },
    );
    const parsed = JSON.parse(stdout) as FfprobeOutput;
    const stream = parsed.streams?.[0];
    if (!stream?.width || !stream?.height) {
      return { isValidVideo: false, width: null, height: null, durationSeconds: null };
    }
    return {
      isValidVideo: true,
      width: stream.width,
      height: stream.height,
      durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null,
    };
  } catch {
    return { isValidVideo: false, width: null, height: null, durationSeconds: null };
  }
}

/** A video is already an acceptable vertical experience if it's taller than it is wide. Landscape and square video get normalized. */
export function isAcceptablyVertical(width: number, height: number): boolean {
  return height > width;
}

/**
 * Crops/scales a non-vertical (landscape or square) video into the
 * required 1080x1920 vertical frame, rather than simply rejecting a
 * dealer's real footage for having the "wrong" aspect ratio. Center-crops
 * after scaling to fill, matching the same target resolution the
 * auto-generation pipeline (src/server/video/generate.ts) produces.
 */
async function normalizeToVertical(inputPath: string, outputPath: string): Promise<void> {
  await run(
    FFMPEG_PATH,
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { maxBuffer: 1024 * 1024 * 64 },
  );
}

export interface ValidateAndNormalizeResult {
  ok: true;
  buffer: Buffer;
  durationSeconds: number | null;
  wasNormalized: boolean;
}
export interface ValidateAndNormalizeError {
  ok: false;
  error: string;
}

/**
 * Full pipeline for a dealer-uploaded video buffer: verify it's actually a
 * playable video (not just correctly-named), then normalize it to a
 * vertical frame if it isn't one already. Returns the buffer to store -
 * either the original (already vertical) or the transcoded one.
 */
export async function validateAndNormalizeUploadedVideo(
  buffer: Buffer,
): Promise<ValidateAndNormalizeResult | ValidateAndNormalizeError> {
  const workDir = await mkdtemp(path.join(tmpdir(), "rvm-upload-"));
  const inputPath = path.join(workDir, "input");
  try {
    await writeFile(inputPath, buffer);

    const probe = await probeVideoFile(inputPath);
    if (!probe.isValidVideo || !probe.width || !probe.height) {
      return { ok: false, error: "This file doesn't appear to be a valid video." };
    }

    if (isAcceptablyVertical(probe.width, probe.height)) {
      return { ok: true, buffer, durationSeconds: probe.durationSeconds, wasNormalized: false };
    }

    const outputPath = path.join(workDir, "output.mp4");
    await normalizeToVertical(inputPath, outputPath);
    const normalizedBuffer = await readFile(outputPath);
    const normalizedProbe = await probeVideoFile(outputPath);
    return {
      ok: true,
      buffer: normalizedBuffer,
      durationSeconds: normalizedProbe.durationSeconds ?? probe.durationSeconds,
      wasNormalized: true,
    };
  } catch {
    return { ok: false, error: "Could not process this video. Try a different file." };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
