import Link from 'next/link';
import { Folder, ArrowUpRight, Mail, PlugZap, Building2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { SupplierMailSetup } from '@/components/supplier-mail-setup';
import { requireRole } from '@/lib/auth';
import { listSupplierCompanies } from '@/lib/supplier-mail/queries';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { folders } from '@/lib/supplier-mail/rules';
import './supplier-mail.css';

async function loadConnections() {
  const db = createAdminClient();
  const result = await db.from('supplier_mail_connections').select('id,created_at,last_received_at,last_checked_at')
    .is('revoked_at', null).order('created_at', { ascending: false });
  if (!result.error || !['42703', 'PGRST204'].includes(result.error.code)) {
    return { ...result, heartbeatAvailable: true };
  }
  const legacy = await db.from('supplier_mail_connections').select('id,created_at,last_received_at')
    .is('revoked_at', null).order('created_at', { ascending: false });
  return { ...legacy, data: legacy.data?.map(connection => ({ ...connection, last_checked_at: null })) ?? null, heartbeatAvailable: false };
}

export default async function SupplierFolders() {
  const profile=await requireRole(['admin','management_viewer']);
  const db=await createClient();
  const [results, connection]=await Promise.all([
    listSupplierCompanies(db).then(companies=>Promise.all(companies.map(async company=>({company,result:await db.from('supplier_mail_documents').select('folder').eq('company',company.id)})))),
    profile.role==='admin'?loadConnections():null,
  ]);
  const activeConnections=connection?.data || [];
  const checkedRecently=activeConnections.some(c=>c.last_checked_at && Date.parse(c.last_checked_at)>Date.now()-45*60_000);
  const connected=connection?.heartbeatAvailable?checkedRecently:activeConnections.some(c=>c.last_received_at);
  return <AppShell profile={profile} title="Company Documents"><div className="supplier-library">
    <header className="supplier-library-heading"><div><Link className="supplier-back" href="/documents">← Documents</Link><h2>Supplier library</h2><p>Company emails & documents <span>·</span> From January 2023</p></div><span className="supplier-scope">{results.length} {results.length===1?'company':'companies'}</span></header>
    {connection&&!connection.error&&!connected&&<section className="supplier-connection-notice" role="status"><PlugZap size={23}/><div>
      <strong>{activeConnections.length?'Gmail sync needs checking':'Gmail sync is not connected yet'}</strong>
      <p>{activeConnections.length
        ? 'Open the company Gmail Apps Script project to run the sync and check its recent executions.'
        : 'Emails and PDFs will appear after the company Gmail account authorizes synchronization.'}</p>
    </div><a className="supplier-small-action" href="#supplier-gmail-setup">Gmail setup <ArrowUpRight size={15}/></a></section>}
    <div className="supplier-company-list">{results.map(({company,result})=><section className="supplier-company-card" key={company.id}><header><span className="supplier-company-mark"><Building2 size={22}/></span><div><h3>{company.name}</h3></div><Link className="supplier-email-link" href={`/documents/suppliers/${company.id}`}><Mail size={16}/> View emails <ArrowUpRight size={14}/></Link></header>
      {result.error?<p role="alert">Unable to load company folders.</p>:<div className="supplier-folder-grid">{folders.map(folder=>{const count=(result.data || []).filter(r=>r.folder===folder).length;return <Link className="supplier-folder-card" key={folder} href={`/documents/suppliers/${company.id}?folder=${encodeURIComponent(folder)}`}><Folder size={22}/><strong>{folder}</strong><span>{count} {count===1?'document':'documents'}</span><ArrowUpRight className="supplier-folder-arrow" size={15}/></Link>;})}</div>}
    </section>)}</div>
    {connection&&(connection.error?<p role="alert">Unable to load Gmail connection status.</p>:<SupplierMailSetup connections={activeConnections}/>)}
  </div></AppShell>;
}
