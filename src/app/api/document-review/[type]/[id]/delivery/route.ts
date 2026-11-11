import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import type { BillingMailStatus } from "@/lib/billing-mail-settings";
import { isDocumentReviewTarget } from "@/lib/document-review-status";
import { createAdminClient } from "@/lib/supabase/admin";

export type DocumentDelivery = {
  status: BillingMailStatus | "not_queued";
  sentAt: string | null;
};

const headers = { "Cache-Control": "private, no-store" };
const approvedDocumentNotFound = { error: "Approved document not found" };

export async function GET(_request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const user = await getSessionProfile();
  if (user?.role !== "admin") return NextResponse.json({ error: "Access denied" }, { status: 403, headers });

  const { type, id } = await params;
  if (!isDocumentReviewTarget(type, id)) {
    return NextResponse.json({ error: "Invalid document" }, { status: 400, headers });
  }

  try {
    const db = createAdminClient();
    if (type === "gym") {
      const { data, error } = await db.from("gym_monthly_approvals")
        .select("approved_at,sent_at").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data?.approved_at) return NextResponse.json(approvedDocumentNotFound, { status: 404, headers });
      return NextResponse.json<DocumentDelivery>({
        status: data.sent_at ? "sent" : "pending",
        sentAt: data.sent_at,
      }, { headers });
    }

    const [approval, delivery] = await Promise.all([
      db.from("billing_run_approvals").select("run_id").eq("run_id", id).maybeSingle(),
      db.from("billing_mail_dispatch").select("status,sent_at").eq("run_id", id).maybeSingle(),
    ]);
    if (approval.error || delivery.error) throw approval.error || delivery.error;
    if (!approval.data) return NextResponse.json(approvedDocumentNotFound, { status: 404, headers });
    return NextResponse.json<DocumentDelivery>({
      status: delivery.data?.status ?? "not_queued",
      sentAt: delivery.data?.sent_at ?? null,
    }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to check email delivery." }, { status: 503, headers });
  }
}
