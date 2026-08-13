/**
 * Video generation worker CLI.
 *
 * Default (no flags): claims and processes every currently-queued
 * video_generation_jobs row once, then exits. Suitable for cron (every 1-2
 * minutes) - `npm run video:worker`.
 *
 * `--loop [intervalSeconds]`: runs as a persistent daemon, polling on the
 * given interval (default 30s) until SIGINT/SIGTERM. Suitable for a
 * dedicated long-lived process (e.g. a Docker container's CMD) on any host
 * that can run FFmpeg - `npm run video:worker:daemon`.
 *
 * Either mode is safe to run as multiple concurrent instances: job claiming
 * uses `SELECT ... FOR UPDATE SKIP LOCKED` (see
 * src/server/video/worker.ts), so two workers polling at once split the
 * queue instead of double-processing the same job.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { processQueuedVideoJobs } from "@/server/video/worker";

const LOOP_FLAG = "--loop";
const DEFAULT_INTERVAL_SECONDS = 30;

function parseArgs(argv: string[]): { loop: boolean; intervalSeconds: number } {
  const idx = argv.indexOf(LOOP_FLAG);
  if (idx === -1) return { loop: false, intervalSeconds: DEFAULT_INTERVAL_SECONDS };
  const parsed = Number(argv[idx + 1]);
  const intervalSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_SECONDS;
  return { loop: true, intervalSeconds };
}

async function runOnce(): Promise<void> {
  const result = await processQueuedVideoJobs();
  if (result.processed > 0 || result.failed > 0) {
    console.log(`Video worker: processed ${result.processed}, failed ${result.failed}.`);
  }
}

async function main() {
  const { loop, intervalSeconds } = parseArgs(process.argv.slice(2));

  if (!loop) {
    await runOnce();
    // The Postgres connection pool (see src/server/db/client.ts) has no
    // idle timeout, so without an explicit exit the process would hang
    // indefinitely after a successful one-shot run instead of returning
    // control to cron/CI.
    process.exit(0);
  }

  console.log(`Video worker: running as a persistent daemon, polling every ${intervalSeconds}s. Ctrl+C to stop.`);
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  while (!stopping) {
    try {
      await runOnce();
    } catch (err) {
      console.error("Video worker: tick failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
  console.log("Video worker: shutting down.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
