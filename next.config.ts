import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Phone photos are posted through the completion Server Action.
    // The Next.js default is 1 MB, which is too small for camera images.
    serverActions: { bodySizeLimit: "12mb" },
  },
};
export default nextConfig;
