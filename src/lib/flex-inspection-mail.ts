import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { gmailGateway } from "@/lib/billing-mail";
import { BILLING_MAIL_FROM } from "@/lib/billing-mail-settings";
import { isFlexPeriod } from "@/lib/flex-inspection";
import { loadFlexInspectionForReport } from "@/lib/flex-inspection-store";
import { generateFlexInspectionReportPack } from "@/lib/flex-reports/generate";
import { createAdminClient } from "@/lib/supabase/admin";

const deliveryTable = "flex_inspection_reviews";
const maximumPdfBytes = 12_000_000;
const recipientSchema = z.string().max(254).email();
const uncertainDelivery = "Gmail did not confirm delivery. Checking again uses the same delivery key.";

type FlexMailClaim = {
  period: string;
  recipient: string;
  kevin_verified_at: string;
  fikri_verified_at: string;
};

type FlexMailOutcome = {
  status: "pending" | "sent" | "failed" | "uncertain";
  sent_at: string | null;
  error: string | null;
};

function configuredRecipient() {
  if (process.env.VERCEL_ENV !== "production") return null;
  const result = recipientSchema.safeParse(process.env.KLGCR_FLEX_REPORT_TO?.trim());
  return result.success ? result.data : null;
}

function deliveryKey(period: string) {
  const hash = createHash("sha256").update("KLGCR Flex Fire Safety Inspection\n" + period).digest("hex");
  const variant = (8 | (parseInt(hash[16], 16) & 3)).toString(16);
  // The company gateway requires a finance-prefixed UUID. A scoped v8 UUID is
  // stable across attempts without overlapping invoice or receipt identifiers.
  return `invoice_${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function sendInspectionReport(claim: FlexMailClaim): Promise<FlexMailOutcome> {
  const { period, recipient } = claim;
  let preparedPdf: Uint8Array;
  try {
    const { inspection, inspectorSignature } = await loadFlexInspectionForReport(period);
    if (!inspection.completedAt) {
      return { status: "failed", sent_at: null, error: "A completed inspection is required before sending." };
    }
    preparedPdf = await generateFlexInspectionReportPack(inspection, inspectorSignature);
    if (!preparedPdf.length || preparedPdf.length > maximumPdfBytes) {
      return { status: "failed", sent_at: null, error: "The inspection PDF is missing or exceeds the 12 MB email limit." };
    }
  } catch {
    return { status: "failed", sent_at: null, error: "Unable to prepare the Flex inspection PDF." };
  }

  const key = deliveryKey(period);
  try {
    const result = await gmailGateway({
      action: "finance-send",
      key,
      from: BILLING_MAIL_FROM,
      to: recipient,
      subject: `Flex monthly fire safety inspection - ${period}`,
      text: [
        "Dear Flex team,",
        `Attached are the fire extinguisher, exit sign and emergency light inspection reports for Blocks C and D for ${period}.`,
        "The inspection has been verified by Kevin and Fikri.",
        "KLG Campus Residence Management",
      ].join("\n\n"),
      fileName: `Flex-Fire-Safety-Inspection-${period}.pdf`,
      pdfBase64: Buffer.from(preparedPdf).toString("base64"),
    }, 25_000);
    if (result.ok === true && result.status === "sent" && result.key === key
      && result.sender === BILLING_MAIL_FROM && result.to === recipient
      && typeof result.sentAt === "string" && Number.isFinite(Date.parse(result.sentAt))) {
      return { status: "sent", sent_at: result.sentAt, error: null };
    }
    if (result.status === "busy") {
      return { status: "pending", sent_at: null, error: "The company Gmail gateway is busy. The email remains queued." };
    }
    if (result.status === "rejected") {
      return { status: "failed", sent_at: null, error: "The company Gmail gateway did not accept this email." };
    }
  } catch {
    // The gateway may have accepted the request before the response was lost.
  }
  return { status: "uncertain", sent_at: null, error: uncertainDelivery };
}

export async function dispatchFlexInspectionMail(period: string) {
  const recipient = configuredRecipient();
  if (!recipient || !isFlexPeriod(period)) return;

  const db = createAdminClient();
  const token = randomUUID();
  const { data, error } = await db.rpc("claim_flex_inspection_mail", {
    p_period: period,
    p_claim_token: token,
    p_recipient: recipient,
  });
  if (error) throw Error("Unable to claim the Flex inspection email.");
  const claim = data as FlexMailClaim | null;
  if (!claim?.period || !claim.kevin_verified_at || !claim.fikri_verified_at) return;

  const outcome = await sendInspectionReport(claim);
  const saved = await db.from(deliveryTable).update({ ...outcome, claim_token: null, locked_until: null })
    .eq("period", period).eq("status", "sending").eq("claim_token", token).select("period").maybeSingle();
  if (saved.error || !saved.data) throw Error("Unable to save the Flex inspection email status.");
}

export async function retryQueuedFlexInspectionMail() {
  if (!configuredRecipient()) return;

  const result = await createAdminClient().from(deliveryTable).select("period")
    .not("kevin_verified_at", "is", null).not("fikri_verified_at", "is", null)
    .or(`status.in.(pending,failed,uncertain),and(status.eq.sending,locked_until.lte.${new Date().toISOString()})`)
    .order("attempted_at", { nullsFirst: true }).order("period").limit(4);
  if (result.error) throw Error("Unable to read the Flex inspection email queue.");

  for (const { period } of result.data) {
    try {
      await dispatchFlexInspectionMail(period);
    } catch {
      console.error("Queued Flex inspection email needs review", { period });
    }
  }
}
