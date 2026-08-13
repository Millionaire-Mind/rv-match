import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf";

/**
 * Generates a stylized placeholder "photo" (solid gradient + label) for
 * seed/demo inventory that has no real photography. This is intentionally
 * abstract, not photorealistic — it must never be mistaken for a real
 * listing photo. See README.md "Known Limitations".
 */
export async function generatePlaceholderPhoto(params: {
  colorHex: string;
  label: string;
  sublabel?: string;
}): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "rvm-photo-"));
  const outPath = path.join(workDir, "photo.jpg");

  const escape = (t: string) => t.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "’");

  const drawLabel = `drawtext=fontfile=${FONT_PATH}:text='${escape(params.label)}':fontsize=64:fontcolor=white@0.92:x=(w-text_w)/2:y=(h-text_h)/2-30`;
  const drawSub = params.sublabel
    ? `,drawtext=fontfile=${FONT_PATH}:text='${escape(params.sublabel)}':fontsize=32:fontcolor=white@0.7:x=(w-text_w)/2:y=(h-text_h)/2+50`
    : "";

  try {
    await run(FFMPEG_PATH, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `gradients=s=1600x1200:c0=${params.colorHex}:c1=101010:x0=0:y0=0:x1=1600:y1=1200`,
      "-frames:v",
      "1",
      "-vf",
      `${drawLabel}${drawSub}`,
      "-q:v",
      "3",
      outPath,
    ]);
    return await readFile(outPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
