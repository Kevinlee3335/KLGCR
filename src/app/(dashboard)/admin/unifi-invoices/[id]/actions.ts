"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { dispatchDocumentReviewPushes } from "@/lib/document-review-notifications";
import { dispatchUnifiInvoiceMail } from "@/lib/unifi-invoice-mail";
import { advanceUnifiInvoiceReview, getUnifiInvoice, unifiInvoicePath, unifiPendingStages, unifiReviewerForStage } from "@/lib/unifi-invoices";
import { canManageUnifiInvoiceEmail } from "../display";

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

  if (stage === "james") {
    after(async () => {
      await dispatchUnifiInvoiceMail(id).catch(() => console.error("TM Unifi approval email pending retry"));
    });
  } else {
    after(() => dispatchDocumentReviewPushes(id).catch(() => console.error("TM Unifi review notification pending retry")));
  }
  revalidatePath("/admin");
  revalidatePath(unifiInvoicePath);
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

export async function retryUnifiInvoiceEmail(form: FormData) {
  const profile = await requireRole(["admin"]);
  const parsed = z.string().uuid().safeParse(form.get("id"));
  if (!parsed.success || !canManageUnifiInvoiceEmail(profile)) redirect(unifiInvoicePath);

  const id = parsed.data;
  const path = `${unifiInvoicePath}/${id}`;
  const invoice = await getUnifiInvoice(id).catch(() => null);
  if (invoice?.review_stage !== "approved") redirect(`${path}?error=email`);

  try {
    const delivery = await dispatchUnifiInvoiceMail(id);
    if (!delivery) throw Error("No approval email delivery was found.");
  } catch {
    redirect(`${path}?error=email`);
  }
  revalidatePath(unifiInvoicePath);
  revalidatePath(path);
  redirect(path);
}
