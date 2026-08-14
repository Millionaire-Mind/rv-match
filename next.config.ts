import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone - a self-contained server bundle with only
  // the production dependencies actually used, traced by Next.js itself.
  // The Dockerfile's runtime stage copies just that output rather than the
  // full node_modules tree, keeping the production image lean.
  output: "standalone",
  experimental: {
    serverActions: {
      // Dealer video uploads can be large (see MAX_VIDEO_BYTES in
      // src/server/dealer/inventory-actions.ts). The action itself
      // re-validates size/type server-side regardless of this ceiling.
      bodySizeLimit: "300mb",
    },
  },
};

export default nextConfig;
