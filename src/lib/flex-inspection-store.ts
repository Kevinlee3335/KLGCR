import { createAdminClient } from "@/lib/supabase/admin";
import type { FlexInspectionSnapshot, FlexSaveInput } from "@/lib/flex-inspection";
import type { Signature } from "@/lib/purchase-orders/signature";
import type { Profile } from "@/lib/types";

const snapshotColumns = "period, revision, exceptions, inspection_date, inspected_by_name, completed_at";

type InspectionScope = "ab" | "cd";

export const inspectionTables: Record<InspectionScope, string> = {
  ab: "ab_fire_safety_inspections",
  cd: "flex_inspections",
};

type InspectionRow = {
  period: string;
  revision: number;
  exceptions: Record<string, string>;
  inspection_date: string;
  inspected_by_name: string | null;
  completed_at: string | null;
};

type ReportRow = InspectionRow & { inspected_by: string | null; inspector_signature: unknown };

function snapshot(period: string, row: InspectionRow | null): FlexInspectionSnapshot {
  return {
    period,
    revision: row?.revision ?? 0,
    exceptions: row?.exceptions ?? {},
    inspectionDate: row?.inspection_date ?? null,
    inspectedByName: row?.inspected_by_name ?? null,
    completedAt: row?.completed_at ?? null,
  };
}

export async function loadFlexInspection(period: string, scope: InspectionScope = "cd"): Promise<FlexInspectionSnapshot> {
  const db = createAdminClient();
  const { data, error } = await db.from(inspectionTables[scope]).select(snapshotColumns)
    .eq("period", period).maybeSingle<InspectionRow>();
  if (error) throw error;
  return snapshot(period, data);
}

export async function loadFlexInspectionForReport(period: string, scope: InspectionScope = "cd"): Promise<{
  inspection: FlexInspectionSnapshot;
  inspectorId: string | null;
  inspectorSignature?: unknown;
}> {
  const db = createAdminClient();
  const { data, error } = await db.from(inspectionTables[scope])
    .select(`${snapshotColumns}, inspected_by, inspector_signature`)
    .eq("period", period).maybeSingle<ReportRow>();
  if (error) throw error;
  return {
    inspection: snapshot(period, data),
    inspectorId: data?.inspected_by ?? null,
    inspectorSignature: data?.inspector_signature ?? undefined,
  };
}

export async function writeFlexInspection(
  input: FlexSaveInput,
  profile: Profile,
  signature: Signature | null,
  scope: InspectionScope = "cd",
): Promise<FlexInspectionSnapshot | null> {
  const db = createAdminClient();
  const values = {
    revision: input.revision + 1,
    exceptions: input.exceptions,
    inspection_date: input.inspectionDate,
    updated_by: profile.id,
    inspected_by: input.complete ? profile.id : null,
    inspected_by_name: input.complete ? profile.full_name : null,
    inspector_signature: input.complete ? signature : null,
    completed_at: input.complete ? new Date().toISOString() : null,
  };

  const table = inspectionTables[scope];
  // A unique period per scope handles concurrent first saves. Existing drafts use a revision check.
  if (input.revision === 0) {
    const { data, error } = await db.from(table).insert({ ...values, period: input.period })
      .select(snapshotColumns).single<InspectionRow>();
    if (error?.code === "23505") return null;
    if (error) throw error;
    return snapshot(input.period, data);
  }

  const { data, error } = await db.from(table).update(values)
    .eq("period", input.period).eq("revision", input.revision).is("completed_at", null)
    .select(snapshotColumns).maybeSingle<InspectionRow>();
  if (error) throw error;
  return data ? snapshot(input.period, data) : null;
}
