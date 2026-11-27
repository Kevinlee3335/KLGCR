import "./documents.css";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DocumentsPanel, type DocumentLibrary } from "@/components/documents-panel";
import { requireRole } from "@/lib/auth";
import { listSupplierCompanies } from "@/lib/supplier-mail/queries";
import { createClient } from "@/lib/supabase/server";

type Database = Awaited<ReturnType<typeof createClient>>;

async function loadDocuments(db: Database): Promise<DocumentLibrary> {
  const documents: DocumentLibrary["documents"] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("system_documents").select("id,file_name,size_bytes,created_at,category")
      .order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (error) return { documents: [], error: error.message };
    documents.push(...(data ?? []));
    if (!data || data.length < 1000) return { documents, error: null };
  }
}

const businessFolders = [
  ["Check-out Batch Reports", "/documents/check-out-batches"],
  ["Utility Reading History", "/documents/utility-readings"],
  ["Receipts", "/documents/receipts"],
  ["Deposit Receipts", "/documents/deposit-receipts"],
  ["Payment Vouchers", "/documents/payment-vouchers"],
  ["TM Unifi Payment Receipts", "/documents/unifi-receipts"],
] as const;

function Folder({ name, href, count }: { name: string; href: string; count?: ReactNode }) {
  return <Link className="documents-company-folder" href={href}><FolderOpen size={20}/><span>{name}</span>
    <strong><Suspense fallback="…">{count ?? "—"}</Suspense></strong></Link>;
}

async function Count({ result }: { result: PromiseLike<{ count: number | null; error: unknown }> }) {
  const { count, error } = await result;
  return error ? "—" : count ?? "—";
}

async function QuotationCount({ db }: { db: Database }) {
  const { data, error } = await db.from("quotation_registry").select("quotes:value->quotes").eq("id", 1).maybeSingle();
  return !error && Array.isArray(data?.quotes) ? data.quotes.length : "—";
}

async function SupplierFolders({ db }: { db: Database }) {
  const { data, error } = await db.from("supplier_mail_suppliers")
    .select("id,name,documents:supplier_mail_documents!supplier_mail_documents_company_fkey(count)").order("name").order("id");
  if (!error) return data?.map(company => <Folder key={company.id} name={company.name}
    href={`/documents/suppliers/${company.id}`} count={company.documents?.[0]?.count} />);
  // The legacy supplier registry has no relationship for an embedded count.
  const companies = await listSupplierCompanies(db);
  return companies.map(company => <Folder key={company.id} name={company.name} href={`/documents/suppliers/${company.id}`}
    count={<Count result={db.from("supplier_mail_documents").select("id", { count: "exact", head: true }).eq("company", company.id)} />} />);
}

function ManagementFolders({ db }: { db: Database }) {
  return <>
    {businessFolders.map(([name, href]) => <Folder key={href} name={name} href={href}/>)}
    {(["rental", "utility"] as const).map(kind => <Folder key={kind} name={kind === "rental" ? "Rental" : "Utilities"}
      href={`/documents/billing/${kind}`}
      count={<Count result={db.from("billing_document_index").select("run_id", { count: "exact", head: true }).eq("kind", kind)} />} />)}
    <Folder name="Purchase Orders" href="/documents/purchase-orders"
      count={<Count result={db.from("inventory_purchase_orders").select("id", { count: "exact", head: true })} />} />
    <Folder name="Quotations" href="/documents/quotations" count={<QuotationCount db={db} />} />
    <Suspense fallback={null}><SupplierFolders db={db}/></Suspense>
  </>;
}

export default async function DocumentsPage() {
  const profile = await requireRole(["admin", "management_viewer", "maintenance_staff", "cleaner"]);
  const db = await createClient();
  const canManage = ["admin", "management_viewer"].includes(profile.role);
  return <AppShell profile={profile} title="Documents">
    <DocumentsPanel documents={loadDocuments(db)} canManage={canManage}
      companyFolders={canManage ? <ManagementFolders db={db}/> : null} />
  </AppShell>;
}
