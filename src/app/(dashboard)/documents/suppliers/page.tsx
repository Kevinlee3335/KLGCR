import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { SupplierMailSetup } from '@/components/supplier-mail-setup';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { suppliers, folders, type Supplier } from '@/lib/supplier-mail/rules';
export default async function SupplierFolders() {
  const profile=await requireRole(['admin','management_viewer']);
  const db=await createClient();
  const results=await Promise.all((Object.keys(suppliers) as Supplier[]).map(async company=>({company,result:await db.from('supplier_mail_documents').select('folder').eq('company',company)})));
  const connection=profile.role==='admin'?await createAdminClient().from('supplier_mail_connections').select('id,created_at,last_received_at').is('revoked_at',null).order('created_at',{ascending:false}):null;
  return <AppShell profile={profile} title="Company Documents"><p><Link href="/documents">← Documents</Link></p><p>Incoming supplier emails and PDF attachments · From 1 January 2023</p>
    {results.map(({company,result})=><section className="panel" key={company}><h2>{suppliers[company].name}</h2><p>{company==='sigma'?'@sigmamy.com company addresses':suppliers[company].email}</p><Link className="button" href={`/documents/suppliers/${company}`}>View emails</Link>
      {result.error?<p role="alert">Unable to load company folders.</p>:<div className="button-row">{folders.map(folder=><Link className="button" key={folder} href={`/documents/suppliers/${company}?folder=${encodeURIComponent(folder)}`}>📁 {folder} ({(result.data || []).filter(r=>r.folder===folder).length})</Link>)}</div>}
    </section>)}
    {profile.role==='admin'&&(connection?.error?<p role="alert">Unable to load Gmail connection status.</p>:<SupplierMailSetup connections={connection?.data || []}/>)}
  </AppShell>;
}
