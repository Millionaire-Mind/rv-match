import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // "server-only" throws unconditionally unless the bundler resolves its
      // "react-server" export condition (which only Next's RSC build does).
      // Vitest isn't that build, so alias it to the package's own no-op
      // "empty.js" export target rather than weakening the guard itself in
      // application code that legitimately needs to stay server-only in Next.
      "server-only": path.resolve(import.meta.dirname, "./node_modules/server-only/empty.js"),
    },
  },
});
