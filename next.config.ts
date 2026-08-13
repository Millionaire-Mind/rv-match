import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
