import type { ArchiveScope } from "@/lib/fire-safety-inspection-folders";
import { isFlexPreview } from "@/lib/flex-inspection-review-store";
import { inspectionTables, loadFlexInspectionForReport } from "@/lib/flex-inspection-store";
import { createAdminClient } from "@/lib/supabase/admin";

type ArchivedInspectionMonth = {
  period: string;
  inspection_date: string;
  inspected_by_name: string | null;
};

const bucketName = "fire-safety-inspection-archive";
const signedUrlLifetime = 120;

export async function listArchivedFireSafetyInspections(scope: ArchiveScope): Promise<ArchivedInspectionMonth[]> {
  if (isFlexPreview()) return [];
  const { data, error } = await createAdminClient().from(inspectionTables[scope])
    .select("period, inspection_date, inspected_by_name").not("completed_at", "is", null)
    .order("period", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getArchivedFireSafetyInspectionUrl(
  scope: ArchiveScope,
  period: string,
  download = false,
): Promise<string | null> {
  if (isFlexPreview()) return null;
  const { inspection, inspectorSignature } = await loadFlexInspectionForReport(period, scope);
  if (!inspection.completedAt) return null;

  const storage = createAdminClient().storage.from(bucketName);
  const path = `${scope}/${period}.pdf`;
  const fileName = `Block-${scope.toUpperCase()}-Fire-Safety-Inspection-${period}.pdf`;
  const sign = () => storage.createSignedUrl(path, signedUrlLifetime, download ? { download: fileName } : undefined);

  const existing = await sign();
  if (!existing.error) return existing.data.signedUrl;
  const errorCode = "code" in existing.error ? existing.error.code : undefined;
  const missing = errorCode === "NoSuchKey"
    || (!errorCode && (existing.error.status === 404 || existing.error.statusCode === "404"));
  if (!missing) throw existing.error;

  const pdf = scope === "ab"
    ? await (await import("@/lib/ab-inspection-pdf")).generateAbInspectionReportPack(inspection, inspectorSignature)
    : await (await import("@/lib/flex-reports/generate")).generateFlexInspectionReportPack(inspection, inspectorSignature);
  const upload = await storage.upload(path, Buffer.from(pdf), {
    contentType: "application/pdf",
    cacheControl: "0",
    upsert: false,
  });

  // A concurrent request may have created the file after the first check.
  const archived = await sign();
  if (archived.error) throw upload.error ?? archived.error;
  return archived.data.signedUrl;
}

export async function archiveFireSafetyInspection(scope: ArchiveScope, period: string): Promise<void> {
  await getArchivedFireSafetyInspectionUrl(scope, period);
}
