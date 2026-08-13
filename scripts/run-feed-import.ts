/**
 * Inventory feed import worker CLI.
 *
 * Default (no flags): runs every active feed source whose refresh interval
 * has elapsed since its last run, once, then exits. Suitable for cron
 * (every few minutes) - `npm run feed:worker`.
 *
 * `--loop [intervalSeconds]`: runs as a persistent daemon, polling on the
 * given interval (default 60s) until SIGINT/SIGTERM - `npm run feed:worker:daemon`.
 *
 * Mirrors scripts/run-video-worker.ts's shape deliberately: both are
 * dedicated worker processes a real deployment schedules externally
 * (cron/systemd timer/Docker sidecar), not an in-process Next.js cron hack.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { processDueFeedSources } from "@/server/dealer/feed-import/run";

const LOOP_FLAG = "--loop";
const DEFAULT_INTERVAL_SECONDS = 60;

function parseArgs(argv: string[]): { loop: boolean; intervalSeconds: number } {
  const idx = argv.indexOf(LOOP_FLAG);
  if (idx === -1) return { loop: false, intervalSeconds: DEFAULT_INTERVAL_SECONDS };
  const parsed = Number(argv[idx + 1]);
  const intervalSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_SECONDS;
  return { loop: true, intervalSeconds };
}

async function runOnce(): Promise<void> {
  const result = await processDueFeedSources();
  if (result.ranCount > 0) {
    console.log(`Feed import worker: ran ${result.ranCount} due feed source(s).`);
  }
}

async function main() {
  const { loop, intervalSeconds } = parseArgs(process.argv.slice(2));

  if (!loop) {
    await runOnce();
    process.exit(0);
  }

  console.log(`Feed import worker: running as a persistent daemon, polling every ${intervalSeconds}s. Ctrl+C to stop.`);
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
      console.error("Feed import worker: tick failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
  console.log("Feed import worker: shutting down.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
