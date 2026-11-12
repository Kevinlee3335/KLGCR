import Link from "next/link";
import { dateLabel, linkArchivePath, recordPath } from "@/app/(dashboard)/admin/cert-servicing/record-model";
import type { createClient } from "@/lib/supabase/server";

type ComplianceLinkRow = {
  id: string;
  supplier_document_id: string;
  cycle: { id: string; due_date: string | null; record: { id: string; title: string } };
};

export async function supplierComplianceLinks(db: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  const grouped = new Map<string, ComplianceLinkRow[]>();
  if (!ids.length) return grouped;
  const { data, error } = await db.from("compliance_cycle_documents")
    .select("id,supplier_document_id,cycle:compliance_cycles!inner(id,due_date,record:compliance_records!inner(id,title))")
    .in("supplier_document_id", ids);
  if (error) return grouped;
  for (const row of (data ?? []) as unknown as ComplianceLinkRow[]) {
    const links = grouped.get(row.supplier_document_id) ?? [];
    links.push(row);
    grouped.set(row.supplier_document_id, links);
  }
  return grouped;
}

export function SupplierComplianceLinks({
  id,
  sourceMessageId,
  isAdmin,
  linked,
}: {
  id: string;
  sourceMessageId?: string;
  isAdmin: boolean;
  linked?: ComplianceLinkRow[];
}) {
  return <>
    {linked?.map(item => <Link
      key={item.id}
      className="supplier-small-action"
      href={`${recordPath(item.cycle.record.id)}?focusCycle=${item.cycle.id}#document-${item.id}`}
    >{item.cycle.record.title}{item.cycle.due_date ? ` · ${dateLabel(item.cycle.due_date)}` : ""}</Link>)}
    {isAdmin && <Link className="supplier-small-action" href={linkArchivePath(id, sourceMessageId)}>Link to Cert &amp; Servicing</Link>}
  </>;
}
