import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

async function runFfmpeg(args: string[]): Promise<void> {
  await run(FFMPEG_PATH, args, { maxBuffer: 1024 * 1024 * 64 });
}

const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 25;
const CLIP_SECONDS = 3;
const XFADE_SECONDS = 0.6;
const MAX_PHOTOS = 5;

export interface VideoOverlayData {
  headline: string; // e.g. "2023 Forest River Rockwood"
  subheadline?: string; // e.g. floorplan
  price: string; // formatted, e.g. "$38,900"
  highlightFeature?: string; // one factual feature, never invented
  dealerName: string;
  ctaText: string; // e.g. "See it at Sunrise RV Center"
}

export interface GenerateVideoResult {
  fileBuffer: Buffer;
  durationSeconds: number;
}

/** Escapes text for safe use inside an ffmpeg drawtext filter argument. */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/%/g, "\\%");
}

function drawText(
  text: string,
  opts: { y: string; size: number; box?: boolean; color?: string },
): string {
  const parts = [
    `drawtext=fontfile=${FONT_PATH}`,
    `text='${escapeDrawtext(text)}'`,
    `fontsize=${opts.size}`,
    `fontcolor=${opts.color ?? "white"}`,
    `x=(w-text_w)/2`,
    `y=${opts.y}`,
  ];
  if (opts.box) {
    parts.push("box=1", "boxcolor=black@0.55", "boxborderw=18");
  } else {
    parts.push("shadowcolor=black@0.85", "shadowx=2", "shadowy=2");
  }
  return parts.join(":");
}

/**
 * Renders one Ken-Burns (slow zoom) clip from a single still photo, with
 * factual text overlays burned in. Every string here comes directly from
 * inventory data supplied by the caller — nothing is invented.
 */
async function renderPhotoClip(
  photoPath: string,
  outPath: string,
  overlayLines: string[],
): Promise<void> {
  const frames = CLIP_SECONDS * FPS;
  const zoompan = [
    `scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH * 2}:${HEIGHT * 2}`,
    `zoompan=z='min(zoom+0.0012,1.18)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
  ].join(",");

  const filters = [zoompan, ...overlayLines].join(",");

  await runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    photoPath,
    "-t",
    String(CLIP_SECONDS),
    "-vf",
    filters,
    "-r",
    String(FPS),
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    outPath,
  ]);
}

/**
 * Concatenates rendered clips with a crossfade transition between each,
 * adds a silent audio track (for player compatibility), and produces a
 * web-optimized, faststart MP4.
 */
async function crossfadeConcat(clipPaths: string[], outPath: string): Promise<number> {
  if (clipPaths.length === 1) {
    await runFfmpeg([
      "-y",
      "-i",
      clipPaths[0],
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outPath,
    ]);
    return CLIP_SECONDS;
  }

  const inputs = clipPaths.flatMap((p) => ["-i", p]);
  let filter = "";
  let lastLabel = "0:v";
  let cumulative = CLIP_SECONDS;

  for (let i = 1; i < clipPaths.length; i++) {
    const outLabel = i === clipPaths.length - 1 ? "vout" : `v${i}`;
    const offset = cumulative - XFADE_SECONDS;
    filter += `[${lastLabel}][${i}:v]xfade=transition=fade:duration=${XFADE_SECONDS}:offset=${offset}[${outLabel}];`;
    lastLabel = outLabel;
    cumulative += CLIP_SECONDS - XFADE_SECONDS;
  }
  filter = filter.slice(0, -1);

  await runFfmpeg([
    "-y",
    ...inputs,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex",
    filter,
    "-map",
    "[vout]",
    "-map",
    `${clipPaths.length}:a`,
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outPath,
  ]);

  return cumulative;
}

/**
 * Generates a 9:16 vertical MP4 from up to MAX_PHOTOS inventory photos with
 * subtle Ken-Burns motion, crossfade transitions, and factual text overlays
 * (year/make/model, price, one highlighted feature, dealer name, CTA).
 * `photoPaths` must be local filesystem paths (callers are responsible for
 * making remote photos available locally first).
 */
export async function generateVerticalVideoFromPhotos(
  photoPaths: string[],
  overlay: VideoOverlayData,
): Promise<GenerateVideoResult> {
  if (photoPaths.length === 0) {
    throw new Error("At least one photo is required to generate a video.");
  }

  const usablePhotos = photoPaths.slice(0, MAX_PHOTOS);
  const workDir = await mkdtemp(path.join(tmpdir(), "rvm-video-"));

  try {
    const clipPaths: string[] = [];

    for (let i = 0; i < usablePhotos.length; i++) {
      const overlays: string[] = [];
      const isFirst = i === 0;
      const isLast = i === usablePhotos.length - 1;

      if (isFirst) {
        overlays.push(drawText(overlay.headline, { y: "140", size: 64, box: true }));
        if (overlay.subheadline) {
          overlays.push(drawText(overlay.subheadline, { y: "230", size: 38, box: true }));
        }
      }
      if (!isFirst && !isLast && overlay.highlightFeature) {
        overlays.push(drawText(overlay.highlightFeature, { y: "140", size: 42, box: true }));
      }
      if (isLast) {
        overlays.push(drawText(overlay.ctaText, { y: "h-360", size: 46, box: true }));
      }
      overlays.push(
        drawText(`${overlay.price} · ${overlay.dealerName}`, {
          y: "h-180",
          size: 40,
          box: true,
        }),
      );

      const clipPath = path.join(workDir, `clip-${i}.mp4`);
      await renderPhotoClip(usablePhotos[i], clipPath, overlays);
      clipPaths.push(clipPath);
    }

    const finalPath = path.join(workDir, "final.mp4");
    const durationSeconds = await crossfadeConcat(clipPaths, finalPath);
    const fileBuffer = await readFile(finalPath);

    return { fileBuffer, durationSeconds };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
