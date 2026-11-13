"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { dispatchDocumentReviewPushes } from "@/lib/document-review-notifications";
import { advanceUnifiInvoiceReview, unifiInvoicePath, unifiPendingStages, unifiReviewerForStage } from "@/lib/unifi-invoices";

const reviewInput = z.object({
  id: z.string().uuid(),
  stage: z.enum(unifiPendingStages),
});

export async function reviewUnifiInvoice(form: FormData) {
  const profile = await requireRole(["admin"]);
  const parsed = reviewInput.safeParse({ id: form.get("id"), stage: form.get("stage") });
  if (!parsed.success) redirect(unifiInvoicePath);

  const { id, stage } = parsed.data;
  const path = `${unifiInvoicePath}/${id}`;
  if (unifiReviewerForStage[stage].id !== profile.id) redirect(`${path}?error=review`);
  try {
    await advanceUnifiInvoiceReview(id, stage, profile.id);
  } catch {
    redirect(`${path}?error=review`);
  }

  if (stage !== "james") {
    after(() => dispatchDocumentReviewPushes(id).catch(() => console.error("TM Unifi review notification pending retry")));
  }
  revalidatePath("/admin");
  revalidatePath(unifiInvoicePath);
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}
