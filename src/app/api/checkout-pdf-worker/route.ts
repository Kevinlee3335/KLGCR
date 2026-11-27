import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

// Serve the exact locally installed PDF.js version, without an external CDN.
// The worker is public application code and contains no user data or credentials.
export async function GET() {
  const worker = await readFile(join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"));
  return new Response(worker, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
