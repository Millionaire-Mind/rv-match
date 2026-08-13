/**
 * Processes every queued video_generation_jobs row once and exits.
 * In production, run this on a schedule (cron every 1-2 minutes) or as a
 * long-lived loop — see README.md "Video generation worker".
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { processQueuedVideoJobs } from "@/server/video/worker";

async function main() {
  const result = await processQueuedVideoJobs();
  console.log(`Video worker: processed ${result.processed}, failed ${result.failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
