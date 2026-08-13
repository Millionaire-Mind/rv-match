import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isAcceptablyVertical, probeVideoFile, validateAndNormalizeUploadedVideo } from "./validate";

const run = promisify(execFile);

/**
 * Integration tests using real ffmpeg/ffprobe (no mocking - this is
 * specifically testing that real video inspection/transcoding works, which
 * a mock can't verify) to prove Phase 4/27's upload validation: a
 * dealer-uploaded file that isn't actually a playable video is rejected
 * regardless of its claimed extension/MIME type (magic-byte-level
 * validation, not just trusting what the browser sent), and a real but
 * landscape/square video gets normalized into the required vertical frame
 * instead of being rejected outright.
 */

let workDir: string;
let landscapeVideoPath: string;
let portraitVideoPath: string;

async function generateTestVideo(outPath: string, size: string): Promise<void> {
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=blue:s=${size}:d=1:r=10`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    outPath,
  ]);
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "rvm-validate-test-"));
  landscapeVideoPath = path.join(workDir, "landscape.mp4");
  portraitVideoPath = path.join(workDir, "portrait.mp4");
  await Promise.all([
    generateTestVideo(landscapeVideoPath, "640x360"),
    generateTestVideo(portraitVideoPath, "360x640"),
  ]);
}, 30_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("isAcceptablyVertical", () => {
  it("accepts height greater than width", () => {
    expect(isAcceptablyVertical(1080, 1920)).toBe(true);
  });
  it("rejects landscape (width > height)", () => {
    expect(isAcceptablyVertical(1920, 1080)).toBe(false);
  });
  it("rejects a perfect square", () => {
    expect(isAcceptablyVertical(1000, 1000)).toBe(false);
  });
});

describe("probeVideoFile", () => {
  it("reads real dimensions from a genuine video file", async () => {
    const result = await probeVideoFile(portraitVideoPath);
    expect(result.isValidVideo).toBe(true);
    expect(result.width).toBe(360);
    expect(result.height).toBe(640);
    expect(result.durationSeconds).toBeGreaterThan(0);
  });

  it("reports isValidVideo: false for a file that isn't actually a video, regardless of its name", async () => {
    const fakePath = path.join(workDir, "not-a-video.mp4");
    await import("node:fs/promises").then((fs) => fs.writeFile(fakePath, "this is just plain text, not a video"));
    const result = await probeVideoFile(fakePath);
    expect(result.isValidVideo).toBe(false);
  });
});

describe("validateAndNormalizeUploadedVideo", () => {
  it("rejects a buffer that isn't a real video even if it claims to be one", async () => {
    const fakeBuffer = Buffer.from("definitely not a video file, just bytes claiming to be one");
    const result = await validateAndNormalizeUploadedVideo(fakeBuffer);
    expect(result.ok).toBe(false);
  });

  it("passes an already-vertical video through unchanged", async () => {
    const buffer = await readFile(portraitVideoPath);
    const result = await validateAndNormalizeUploadedVideo(buffer);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wasNormalized).toBe(false);
      expect(result.buffer.equals(buffer)).toBe(true);
    }
  }, 15_000);

  it("normalizes a landscape video into a vertical frame instead of rejecting it", async () => {
    const buffer = await readFile(landscapeVideoPath);
    const result = await validateAndNormalizeUploadedVideo(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wasNormalized).toBe(true);

    // Prove the OUTPUT is actually vertical now, not just that some bytes came back.
    const outPath = path.join(workDir, "check-normalized.mp4");
    await import("node:fs/promises").then((fs) => fs.writeFile(outPath, result.buffer));
    const probed = await probeVideoFile(outPath);
    expect(probed.isValidVideo).toBe(true);
    expect(probed.height!).toBeGreaterThan(probed.width!);
  }, 15_000);
});
