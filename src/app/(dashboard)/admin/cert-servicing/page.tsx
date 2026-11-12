import { redirect } from "next/navigation";
import { isRecordUuid, isSourceMessageId, sectionPath, sections } from "./record-model";

export default async function CertServicingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; supplierDocumentId?: string; sourceMessageId?: string }>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.error) params.set("error", query.error);
  if (query.saved) params.set("saved", query.saved);
  if (isRecordUuid(query.supplierDocumentId)) params.set("supplierDocumentId", query.supplierDocumentId);
  if (isSourceMessageId(query.sourceMessageId)) params.set("sourceMessageId", query.sourceMessageId);
  redirect(sectionPath(sections[0]) + (params.size ? `?${params.toString()}` : ""));
}
