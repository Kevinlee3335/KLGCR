import { cache } from "react";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FlexGroup, FlexReportType } from "@/lib/flex-inspection";

const reportTypeSchema = z.enum(["fire-extinguisher", "exit-sign", "emergency-light"]);

const groupSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  report: reportTypeSchema,
  block: z.enum(["C", "D"]),
  level: z.number().int().min(1).max(9).nullable(),
  location: z.string().trim().min(1).max(80),
  quantity: z.number().int().positive(),
  sourceCell: z.string().regex(/^[A-Z]+[1-9]\d*$/),
  units: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    label: z.string().trim().min(1).max(40),
  })).nonempty(),
});

export const loadFlexGroups = cache(async function loadFlexGroups(): Promise<FlexGroup[]> {
  const { data, error } = await createAdminClient()
    .from("flex_inspection_catalog")
    .select("groups")
    .eq("id", 1)
    .single();
  if (error) throw new Error("Unable to load the Flex equipment list.");

  const groups = z.array(groupSchema).nonempty().parse(data?.groups);
  const ids = groups.flatMap(group => group.units.map(unit => unit.id));
  const groupIds = new Set(groups.map(group => group.id));
  if (groupIds.size !== groups.length || new Set(ids).size !== ids.length || groups.some(group => group.units.length !== group.quantity)) {
    throw new Error("The Flex equipment list contains invalid groups.");
  }
  return groups;
});

export async function loadFlexReportTemplate(report: FlexReportType): Promise<Uint8Array> {
  const { data, error } = await createAdminClient()
    .from("flex_inspection_report_templates")
    .select("content_base64")
    .eq("report_type", report)
    .single();
  if (error || !data?.content_base64) throw new Error("Unable to load the Flex report template.");
  return Buffer.from(data.content_base64, "base64");
}
