/**
 * The one place server-side errors get recorded. Deliberately not a
 * third-party APM/Sentry integration - this is V1's honest floor: every
 * unexpected failure is emitted as a single structured JSON line to
 * stderr (console.error), so it's at minimum greppable/parseable by
 * whatever log aggregation the deployment target already has (Vercel logs,
 * `docker compose logs`, etc.), instead of being silently swallowed by a
 * catch block that only returns a generic message to the caller.
 */
export function logError(context: string, error: unknown, metadata?: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      level: "error",
      context,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...metadata,
      timestamp: new Date().toISOString(),
    }),
  );
}
