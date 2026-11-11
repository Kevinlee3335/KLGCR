import { z } from "zod";
import { getSessionProfile } from "@/lib/auth";
import { membershipEnabled } from "@/lib/membership";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const media = {
  "payment-receipt": { table: "membership_payments", column: "receipt_path", bucket: "membership-receipts" },
  "request-receipt": { table: "membership_requests", column: "receipt_path", bucket: "membership-receipts" },
  "member-photo": { table: "memberships", column: "photo_path", bucket: "membership-photos" },
} as const;
const routeParams = z.object({
  kind: z.enum(["payment-receipt", "request-receipt", "member-photo"]),
  id: z.string().uuid(),
});
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const profile = await getSessionProfile();
  if (profile?.role !== "admin") return new Response("Access denied", { status: 403, headers });
  if (!membershipEnabled()) return new Response("Not available", { status: 404, headers });
  const parsed = routeParams.safeParse(await params);
  if (!parsed.success) return new Response("Invalid media reference", { status: 400, headers });

  const { kind, id } = parsed.data;
  const target = media[kind];
  try {
    const db = createAdminClient();
    const { data, error } = await db.from(target.table).select(target.column).eq("id", id).maybeSingle();
    if (error) throw error;
    const path = data && ("receipt_path" in data ? data.receipt_path : data.photo_path);
    if (typeof path !== "string" || !path) return new Response("File not found", { status: 404, headers });

    const link = await db.storage.from(target.bucket).createSignedUrl(path, 300);
    if (link.error || !link.data?.signedUrl) throw new Error("Unable to sign membership media.");
    return new Response(null, { status: 302, headers: { ...headers, Location: link.data.signedUrl } });
  } catch {
    return new Response("Unable to open this file. Please try again.", { status: 503, headers });
  }
}
