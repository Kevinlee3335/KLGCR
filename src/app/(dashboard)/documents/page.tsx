import "./documents.css";
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
  const canManage=["admin","management_viewer"].includes(profile.role);
  const companyFolders=canManage ? await Promise.all(["sigma","mfe"].map(async company=>{
    const result=await supabase.from("supplier_mail_documents").select("id",{count:"exact",head:true}).eq("company",company);
    return {name:company==="sigma"?"Sigma":"MFE",href:`/documents/suppliers/${company}`,count:result.error?null:result.count || 0};
  })) : [];
  const businessFolders=canManage ? await Promise.all([
    Promise.resolve({name:'Receipts',href:'/documents/receipts',count:null}),
    ...(['rental','utility'] as const).map(async kind=>{const r=await supabase.from('billing_document_index').select('run_id',{count:'exact',head:true}).eq('kind',kind);return {name:kind==='rental'?'Rental':'Utilities',href:`/documents/billing/${kind}`,count:r.error?null:r.count||0};}),
    (async()=>{const r=await supabase.from('inventory_purchase_orders').select('id',{count:'exact',head:true});return {name:'Purchase Orders',href:'/documents/purchase-orders',count:r.error?null:r.count||0};})(),
    (async()=>{const r=await supabase.from('quotation_registry').select('value').eq('id',1).maybeSingle();return {name:'Quotations',href:'/documents/quotations',count:r.error?null:((r.data?.value as {quotes?:unknown[]}|undefined)?.quotes?.length||0)};})(),
  ]) : [];
  return <AppShell profile={profile} title="Documents">{error ? <div className="card" role="alert">Unable to load documents: {error.message}</div> : <DocumentsPanel documents={data || []} canManage={canManage} companyFolders={[...businessFolders,...companyFolders]}/>}</AppShell>;
}
