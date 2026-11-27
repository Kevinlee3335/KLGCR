import Link from "next/link";
import { Suspense } from "react";
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

type LinkLookup = ReturnType<typeof supplierComplianceLinks>;

async function LinkedRecords({ id, links }: { id: string; links: LinkLookup }) {
  const linked = (await links).get(id);
  return linked?.map(item => <Link
    key={item.id}
    className="supplier-small-action"
    href={`${recordPath(item.cycle.record.id)}?focusCycle=${item.cycle.id}#document-${item.id}`}
  >{item.cycle.record.title}{item.cycle.due_date ? ` · ${dateLabel(item.cycle.due_date)}` : ""}</Link>);
}

export function SupplierComplianceLinks({
  id,
  sourceMessageId,
  isAdmin,
  links,
}: {
  id: string;
  sourceMessageId?: string;
  isAdmin: boolean;
  links: LinkLookup;
}) {
  return <>
    <Suspense fallback={null}><LinkedRecords id={id} links={links}/></Suspense>
    {isAdmin && <Link className="supplier-small-action" href={linkArchivePath(id, sourceMessageId)}>Link to Cert &amp; Servicing</Link>}
  </>;
}
