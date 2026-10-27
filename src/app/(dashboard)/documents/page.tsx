import "./documents.css";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DocumentsPanel } from "@/components/documents-panel";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export default async function DocumentsPage() {
  const profile = await requireRole(["admin","management_viewer","maintenance_staff","cleaner"]);
  const supabase = await createClient();
  const data: { id: string; file_name: string; size_bytes: number; created_at: string; category: string | null }[] = [];
  let error: { message: string } | null = null;
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from("system_documents").select("id,file_name,size_bytes,created_at,category").order("created_at",{ ascending: false }).order("id").range(offset,offset + 999);
    if (result.error) { error = result.error; break; }
    data.push(...(result.data || []));
    if (!result.data || result.data.length < 1000) break;
  }
  return <AppShell profile={profile} title="Documents">{["admin","management_viewer"].includes(profile.role) && <section className="panel"><h2>Company Documents</h2><p>Sigma and MFE · Emails, quotations, invoices and service reports</p><Link className="button" href="/documents/suppliers">Open company folders →</Link></section>}{error ? <div className="card" role="alert">Unable to load documents: {error.message}</div> : <DocumentsPanel documents={data || []} canManage={["admin","management_viewer"].includes(profile.role)}/>}</AppShell>;
}
