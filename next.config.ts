import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['pdfjs-dist'],
  outputFileTracingIncludes: { "/api/billing-documents/*/*": ["./public/billing/logo.jpg"], "/api/billing-preview/*/approve": ["./public/billing/logo.jpg"], "/api/billing-preview/*/email": ["./public/billing/logo.jpg"], "/api/purchase-orders": ["./src/lib/purchase-orders/template.pdf"], "/api/purchase-orders/*/pdf": ["./src/lib/purchase-orders/template.pdf"] },
  experimental: {
    // Phone photos are posted through the completion Server Action.
    // The Next.js default is 1 MB, which is too small for camera images.
    serverActions: { bodySizeLimit: "12mb" },
  },
};
export default nextConfig;
