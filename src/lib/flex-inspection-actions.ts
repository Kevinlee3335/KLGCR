"use server";

import { z } from "zod";
import { getSessionProfile } from "@/lib/auth";
import {
  FLEX_INSPECTION_ROLES,
  FLEX_REMARK_MAX_LENGTH,
  isFlexPeriod,
  type FlexSaveInput,
  type FlexSaveResult,
} from "@/lib/flex-inspection";
import { loadFlexGroups } from "@/lib/flex-inspection-catalog";
import { writeFlexInspection } from "@/lib/flex-inspection-store";
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

export async function saveFlexInspection(input: FlexSaveInput): Promise<FlexSaveResult> {
  const profile = await getSessionProfile();
  if (!profile || !FLEX_INSPECTION_ROLES.includes(profile.role)) {
    return { ok: false, message: "You do not have access to Flex inspections." };
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
    const groups = await loadFlexGroups();
    const unitIds = new Set(groups.flatMap((group) => group.units.map((unit) => unit.id)));
    if (Object.keys(details.exceptions).some((id) => !unitIds.has(id))) {
      return { ok: false, message: "The inspection contains an unknown equipment item. Reload the checklist." };
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

    const inspection = await writeFlexInspection(details, profile, signature);
    if (!inspection) {
      return { ok: false, code: "conflict", message: "This month's inspection has changed. Reload it before saving again." };
    }
    return { ok: true, inspection };
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error ? error.message : undefined;
    console.error("Flex inspection could not be saved", message);
    return { ok: false, message: "Could not save the Flex inspection. Try again." };
  }
}
