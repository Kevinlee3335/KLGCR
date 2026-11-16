import { randomUUID } from "node:crypto";
import { gmailGateway } from "@/lib/billing-mail";
import { BILLING_MAIL_FROM } from "@/lib/billing-mail-settings";
import { isFlexPeriod } from "@/lib/flex-inspection";
import { flexInspectionMailRecipients, type FlexInspectionMailRecipients } from "@/lib/flex-inspection-mail-settings";
import { loadFlexInspectionForReport } from "@/lib/flex-inspection-store";
import { generateFlexInspectionReportPack } from "@/lib/flex-reports/generate";
import { createAdminClient } from "@/lib/supabase/admin";

const deliveryTable = "flex_inspection_reviews";
const maximumPdfBytes = 12_000_000;
const uncertainDelivery = "Gmail did not confirm delivery. Checking again uses the same delivery key.";
const gatewayNotReady = "The company Gmail gateway has not enabled Flex emails with CC.";

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

function matchesFlexRecipients(result: { to?: unknown; cc?: unknown }, { to, cc }: FlexInspectionMailRecipients) {
  return result.to === to && Array.isArray(result.cc)
    && result.cc.length === cc.length && result.cc.every((email, index) => email === cc[index]);
}

async function sendInspectionReport(period: string, recipients: FlexInspectionMailRecipients): Promise<FlexMailOutcome> {
  try {
    const gateway = await gmailGateway({ action: "flex-inspection-capabilities" }, 10_000);
    if (gateway.ok !== true || gateway.sender !== BILLING_MAIL_FROM
      || !Array.isArray(gateway.capabilities)
      || !["combinedPdf", "cc", "idempotency"].every(capability => gateway.capabilities.includes(capability))) {
      return { status: "failed", sent_at: null, error: gatewayNotReady };
    }
  } catch {
    return { status: "failed", sent_at: null, error: gatewayNotReady };
  }

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

  const key = `flex-inspection_${period}`;
  try {
    const result = await gmailGateway({
      action: "flex-inspection-send",
      key,
      from: BILLING_MAIL_FROM,
      ...recipients,
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
      && result.sender === BILLING_MAIL_FROM && matchesFlexRecipients(result, recipients)
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
  if (process.env.VERCEL_ENV !== "production" || !isFlexPeriod(period)) return;
  const recipients = await flexInspectionMailRecipients();
  if (!recipients) return;

  return dispatchFlexInspectionMailTo(period, recipients);
}

async function dispatchFlexInspectionMailTo(period: string, recipients: FlexInspectionMailRecipients) {
  const db = createAdminClient();
  const token = randomUUID();
  const { data, error } = await db.rpc("claim_flex_inspection_mail", {
    p_period: period,
    p_claim_token: token,
    p_recipient: recipients.to,
  });
  if (error) throw Error("Unable to claim the Flex inspection email.");
  const claim = data as FlexMailClaim | null;
  if (!claim || claim.period !== period || claim.recipient !== recipients.to || !claim.kevin_verified_at || !claim.fikri_verified_at) return;

  const outcome = await sendInspectionReport(period, recipients);
  const saved = await db.from(deliveryTable).update({ ...outcome, claim_token: null, locked_until: null })
    .eq("period", period).eq("status", "sending").eq("claim_token", token).select("period").maybeSingle();
  if (saved.error || !saved.data) throw Error("Unable to save the Flex inspection email status.");
}

export async function retryQueuedFlexInspectionMail() {
  if (process.env.VERCEL_ENV !== "production") return;
  const recipients = await flexInspectionMailRecipients();
  if (!recipients) return;

  const result = await createAdminClient().from(deliveryTable).select("period")
    .not("kevin_verified_at", "is", null).not("fikri_verified_at", "is", null)
    .or(`status.in.(pending,failed,uncertain),and(status.eq.sending,locked_until.lte.${new Date().toISOString()})`)
    .order("attempted_at", { nullsFirst: true }).order("period").limit(4);
  if (result.error) throw Error("Unable to read the Flex inspection email queue.");

  for (const { period } of result.data) {
    try {
      await dispatchFlexInspectionMailTo(period, recipients);
    } catch {
      console.error("Queued Flex inspection email needs review", { period });
    }
  }
}
