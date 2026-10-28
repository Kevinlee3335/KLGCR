import Link from 'next/link';
import { Folder, ArrowUpRight, Mail, PlugZap, Building2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { SupplierMailSetup } from '@/components/supplier-mail-setup';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { suppliers, folders, type Supplier } from '@/lib/supplier-mail/rules';
import './supplier-mail.css';
export default async function SupplierFolders() {
  const profile=await requireRole(['admin','management_viewer']);
  const db=await createClient();
  const results=await Promise.all((Object.keys(suppliers) as Supplier[]).map(async company=>({company,result:await db.from('supplier_mail_documents').select('folder').eq('company',company)})));
  const connection=profile.role==='admin'?await createAdminClient().from('supplier_mail_connections').select('id,created_at,last_received_at').is('revoked_at',null).order('created_at',{ascending:false}):null;
  const received=connection?.data?.some(c=>c.last_received_at);
  return <AppShell profile={profile} title="Company Documents"><div className="supplier-library">
    <header className="supplier-library-heading"><div><Link className="supplier-back" href="/documents">← Documents</Link><h2>Supplier library</h2><p>Company emails & documents <span>·</span> From January 2023</p></div><span className="supplier-scope">2 companies</span></header>
    {profile.role==='admin'&&!connection?.error&&!received&&<section className="supplier-connection-notice" role="status"><PlugZap size={23}/><div><strong>{connection?.data?.length?'Waiting for Gmail sync':'Gmail sync is not connected yet'}</strong><p>{connection?.data?.length?'A connection key exists, but no emails have arrived. Complete Google authorization and run the sync script.':'The folders are ready. Emails and PDFs will appear after the company Google account authorizes synchronization.'}</p></div><a className="supplier-small-action" href="#supplier-gmail-setup">Set up connection <ArrowUpRight size={15}/></a></section>}
    <div className="supplier-company-list">{results.map(({company,result})=><section className="supplier-company-card" key={company}><header><span className="supplier-company-mark"><Building2 size={22}/></span><div><h3>{suppliers[company].name}</h3><p>{company==='sigma'?'Elevator services · sigmamy.com':'Fire protection · mfetsb@gmail.com'}</p></div><Link className="supplier-email-link" href={`/documents/suppliers/${company}`}><Mail size={16}/> View emails <ArrowUpRight size={14}/></Link></header>
      {result.error?<p role="alert">Unable to load company folders.</p>:<div className="supplier-folder-grid">{folders.map(folder=>{const count=(result.data || []).filter(r=>r.folder===folder).length;return <Link className="supplier-folder-card" key={folder} href={`/documents/suppliers/${company}?folder=${encodeURIComponent(folder)}`}><Folder size={22}/><strong>{folder}</strong><span>{count} {count===1?'document':'documents'}</span><ArrowUpRight className="supplier-folder-arrow" size={15}/></Link>;})}</div>}
    </section>)}</div>
    {profile.role==='admin'&&(connection?.error?<p role="alert">Unable to load Gmail connection status.</p>:<SupplierMailSetup connections={connection?.data || []}/>)}
  </div></AppShell>;
}
