import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  webpack(config, { isServer }) {
    if (!isServer && config.cache && typeof config.cache === "object" && config.cache.type === "filesystem") {
      // The cached Next bootstrap can otherwise keep the empty optional hook
      // from a build that predates the client instrumentation file.
      config.cache.buildDependencies = {
        ...config.cache.buildDependencies,
        navigation: [path.join(__dirname, "src/instrumentation-client.ts")],
      };
    }
    return config;
  },
  serverExternalPackages: ['pdfjs-dist', 'imapflow', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    "/api/checkout-pdf-worker": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"],
    "/api/gym-deposits": ["./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*"],
    "/api/gym-deposits/*/*/pdf": ["./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*"],
    // PDF.js loads its graphics bindings and worker dynamically. Keep these
    // runtime assets in every function that reads a Unifi PDF.
    "/api/cron/unifi-invoices": ["./node_modules/@napi-rs/canvas*/**/*", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/unifi-invoices/sync": ["./node_modules/@napi-rs/canvas*/**/*", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/unifi-invoices/import": ["./node_modules/@napi-rs/canvas*/**/*", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/checkouts/batches/*/close": ["./public/klg-campus-residence-logo.png", "./src/lib/finance-fonts/*.ttf"],
    "/api/cron/billing-mail": ["./public/billing/logo.jpg"],
    "/admin/document-review/*/*": ["./public/billing/logo.jpg", "./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*.ttf"],
    "/api/billing-preview/customer-invoices": ["./node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf", "./node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf"], "/api/payment-mail": ["./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*.ttf"], "/api/finance": ["./public/billing/logo.jpg", "./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*.ttf"], "/admin/members": ["./public/billing/logo.jpg", "./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*.ttf"], "/api/cron/membership": ["./public/billing/logo.jpg", "./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*"], "/api/billing-documents/*/*": ["./public/billing/logo.jpg", "./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*.ttf"], "/api/billing-preview/*/approve": ["./public/billing/logo.jpg", "./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*.ttf"], "/api/billing-preview/*/email": ["./public/billing/logo.jpg", "./public/billing/receipt-letterhead.png", "./src/lib/finance-fonts/*.ttf"], "/api/purchase-orders": ["./src/lib/purchase-orders/template.pdf"], "/api/purchase-orders/*/pdf": ["./src/lib/purchase-orders/template.pdf"] },
  experimental: {
    webpackBuildWorker: true,
    // Phone photos are posted through the completion Server Action.
    // The Next.js default is 1 MB, which is too small for camera images.
    serverActions: { bodySizeLimit: "12mb" },
  },
};
export default nextConfig;
