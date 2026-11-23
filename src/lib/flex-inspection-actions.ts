"use server";

import { after } from "next/server";
import { z } from "zod";
import { loadAbInspectionGroups } from "@/lib/ab-inspection-catalog";
import { generateAbInspectionPdf } from "@/lib/ab-inspection-pdf";
import { getSessionProfile } from "@/lib/auth";
import { archiveFireSafetyInspection } from "@/lib/fire-safety-inspection-archive";
import {
  FLEX_INSPECTION_ROLES,
  FLEX_REMARK_MAX_LENGTH,
  isAbReportType,
  isFlexPeriod,
  isFlexReportType,
  type FlexSaveInput,
  type FlexSaveResult,
} from "@/lib/flex-inspection";
import { loadFlexGroups } from "@/lib/flex-inspection-catalog";
import { isFlexPreview } from "@/lib/flex-inspection-review-store";
import { writeFlexInspection } from "@/lib/flex-inspection-store";
import { generateFlexInspectionPdf } from "@/lib/flex-reports/generate";
import { signatureSchema, type Signature } from "@/lib/purchase-orders/signature";
import { createClient } from "@/lib/supabase/server";

const dateInMalaysia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const saveSchema = z.object({
  period: z.string().refine(isFlexPeriod),
  revision: z.number().int().min(0).max(2_147_483_646),
  exceptions: z.record(z.string().trim().max(FLEX_REMARK_MAX_LENGTH)),
  inspectionDate: z.string().date().refine((date) => date >= "0001-01-01"),
  complete: z.boolean(),
});

async function saveInspection(input: FlexSaveInput, scope: "ab" | "cd"): Promise<FlexSaveResult> {
  const inspectionName = scope === "ab" ? "Block A & B fire safety" : "Flex";
  const profile = await getSessionProfile();
  if (!profile || !FLEX_INSPECTION_ROLES.includes(profile.role)) {
    return { ok: false, message: `You do not have access to ${inspectionName} inspections.` };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path[0] === "inspectionDate") {
      return { ok: false, message: "Enter a valid inspection date up to today." };
    }
    if (issue.path[0] === "exceptions") {
      return { ok: false, message: `Enter remarks of up to ${FLEX_REMARK_MAX_LENGTH} characters.` };
    }
    return { ok: false, message: "The inspection details are invalid. Reopen the inspection and try again." };
  }

  const details = parsed.data;
  const today = dateInMalaysia.format(new Date());
  if (details.period > today.slice(0, 7)) {
    return { ok: false, message: "Choose the current report month or an earlier month." };
  }
  if (details.inspectionDate > today) {
    return { ok: false, message: "Enter a valid inspection date up to today." };
  }
  if (details.complete && Object.values(details.exceptions).some((remark) => !remark)) {
    return { ok: false, message: "Add a remark for each item marked X before completing the inspection." };
  }

  try {
    const groups = await (scope === "ab" ? loadAbInspectionGroups() : loadFlexGroups());
    const unitIds = new Set(groups.flatMap((group) => group.units.map((unit) => unit.id)));
    if (Object.keys(details.exceptions).some((id) => !unitIds.has(id))) {
      return { ok: false, message: "The inspection contains an unknown equipment item. Reload the checklist." };
    }

    if (isFlexPreview()) {
      return {
        ok: true,
        inspection: {
          period: details.period,
          revision: details.revision + 1,
          exceptions: details.exceptions,
          inspectionDate: details.inspectionDate,
          inspectedByName: details.complete ? "Trial Inspector" : null,
          completedAt: details.complete ? new Date().toISOString() : null,
        },
      };
    }

    let signature: Signature | null = null;
    if (details.complete) {
      const db = await createClient();
      const { data, error } = await db.from("user_e_signatures").select("signature")
        .eq("user_id", profile.id).maybeSingle();
      if (error) throw error;
      if (data) {
        const parsedSignature = signatureSchema.safeParse(data.signature);
        if (parsedSignature.success) signature = parsedSignature.data;
      }
    }

    const inspection = await writeFlexInspection(details, profile, signature, scope);
    if (!inspection) {
      return { ok: false, code: "conflict", message: "This month's inspection has changed. Reload it before saving again." };
    }
    if (inspection.completedAt) {
      const { period } = inspection;
      try {
        after(async () => {
          try {
            await archiveFireSafetyInspection(scope, period);
          } catch {
            console.error("Fire safety inspection PDF could not be archived", { scope, period });
          }
        });
      } catch {
        console.error("Fire safety inspection PDF could not be queued for archiving", { scope, period });
      }
    }
    return { ok: true, inspection };
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error ? error.message : undefined;
    console.error("Fire safety inspection could not be saved", { scope, message });
    return { ok: false, message: `Could not save the ${inspectionName} inspection. Try again.` };
  }
}

export async function saveFlexInspection(input: FlexSaveInput): Promise<FlexSaveResult> {
  return saveInspection(input, "cd");
}

export async function saveAbFireSafetyInspection(input: FlexSaveInput): Promise<FlexSaveResult> {
  return saveInspection(input, "ab");
}

export async function downloadFlexPreviewReport(report: string, input: FlexSaveInput) {
  if (!isFlexPreview() || !isFlexReportType(report) || !input?.complete) {
    return { ok: false as const, message: "This preview report is unavailable." };
  }
  const result = await saveFlexInspection(input);
  if (!result.ok) return result;

  try {
    const pdf = await generateFlexInspectionPdf(report, result.inspection);
    return { ok: true as const, content: Buffer.from(pdf).toString("base64") };
  } catch {
    return { ok: false as const, message: "The preview report could not be generated. Try again." };
  }
}

export async function downloadAbInspectionPreviewReport(report: string, input: FlexSaveInput) {
  if (!isFlexPreview() || !isAbReportType(report) || !input?.complete) {
    return { ok: false as const, message: "This preview report is unavailable." };
  }
  const result = await saveAbFireSafetyInspection(input);
  if (!result.ok) return result;

  try {
    const pdf = await generateAbInspectionPdf(report, result.inspection);
    return { ok: true as const, content: Buffer.from(pdf).toString("base64") };
  } catch {
    return { ok: false as const, message: "The preview report could not be generated. Try again." };
  }
}
