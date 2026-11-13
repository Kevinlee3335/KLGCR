import { DashboardActionFollowUp } from "./dashboard-action-follow-up";
import {
  complianceBase, evidenceLabels, recordPath, stageForReviewer, type EvidenceKind,
} from "@/app/(dashboard)/admin/cert-servicing/record-model";
import { createClient } from "@/lib/supabase/server";

type ReviewRow = {
  id: string;
  cycle_id: string;
  kind: EvidenceKind;
  file_name: string;
  cycle: {
    record_id: string;
    record: { title: string; location: string | null };
  };
};

export async function ComplianceReviewFollowUp({ userId }: { userId: string }) {
  const stage = stageForReviewer(userId);
  if (!stage) return null;
  const db = await createClient();
  const query = db.from("compliance_cycle_documents")
    .select("id,cycle_id,kind,file_name,cycle:compliance_cycles!inner(record_id,record:compliance_records!inner(title,location))", { count: "exact" })
    .order("created_at").limit(12);
  const { data, count, error } = await (stage === "james"
    ? query.eq("review_stage", stage)
    : query.in("review_stage", ["verification", stage]));
  if (error || !count) return null;
  const documents = (data ?? []) as unknown as ReviewRow[];
  return (
    <DashboardActionFollowUp
      title={stage === "james" ? "Cert & Servicing Approval" : "Cert & Servicing Verification"}
      subtitle="Supplier PDFs filed under their renewal or service cycle."
      count={count}
      items={documents.map(document => ({
        id: document.id,
        name: [document.cycle.record.title, document.cycle.record.location].filter(Boolean).join(" · "),
        detail: document.file_name,
        meta: evidenceLabels[document.kind],
        href: `${recordPath(document.cycle.record_id)}?focusCycle=${document.cycle_id}#document-${document.id}`,
      }))}
      href={complianceBase}
      action={stage === "james" ? "Review & approve" : "Review & verify"}
      nameColumn="Record"
      detailColumn="PDF"
      metaColumn="Document type"
    />
  );
}
