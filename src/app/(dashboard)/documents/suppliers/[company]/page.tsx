import Link from 'next/link';
import '../supplier-mail.css';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { SupplierDocumentFolder } from '@/components/supplier-document-folder';
import { SupplierDocumentButton } from '@/components/supplier-document-button';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { suppliers, folders, type Supplier } from '@/lib/supplier-mail/rules';
export default async function CompanyArchive({params,searchParams}:{params:Promise<{company:string}>;searchParams:Promise<{folder?:string;q?:string;page?:string}>}) {
  const profile=await requireRole(['admin','management_viewer']);
  const {company}=await params;
  if(!Object.hasOwn(suppliers,company)) notFound();
  const supplier=suppliers[company as Supplier];
  const search=await searchParams;
  const folder=folders.find(f=>f===search.folder);
  const q=(search.q || '').slice(0,200).replace(/[%_,()]/g,' ');
  const page=Math.max(1,Math.min(10000,Number.parseInt(search.page || '1') || 1)),offset=(page-1)*50;
  const db=await createClient();
  let query=folder?db.from('supplier_mail_documents').select('id,file_name,folder,size_bytes,created_at,supplier_mail_attachments(message_id,supplier_emails(subject,received_at))',{count:'exact'}).eq('company',company).eq('folder',folder):db.from('supplier_emails').select('id,subject,sender,received_at',{count:'exact'}).eq('company',company);
  if(q) query=query.ilike(folder?'file_name':'subject',`%${q}%`);
  const result=await query.order(folder?'created_at':'received_at',{ascending:false}).order('id').range(offset,offset+49);
  function url(next:number){return `?${new URLSearchParams({...folder?{folder}:{},...q?{q}:{},page:String(next)})}`;}
  return <AppShell profile={profile} title={supplier.name}><div className="supplier-archive"><p><Link className="supplier-back" href="/documents/suppliers">← Company folders</Link></p><nav className="supplier-tabs" aria-label="Company document folders"><Link className={!folder?"is-active":""} href={`/documents/suppliers/${company}`}>Emails</Link>{folders.map(f=><Link className={folder===f?"is-active":""} key={f} href={`?folder=${encodeURIComponent(f)}`}>{f}</Link>)}</nav>
    <section className="supplier-records"><header className="supplier-records-toolbar"><h2>{folder || 'Emails'}</h2><form className="supplier-search"><input type="hidden" name="folder" value={folder || ''}/><label><span className="supplier-sr-only">Search {folder?'filename':'email subject'}</span><input placeholder={folder?'Search documents…':'Search emails…'} name="q" defaultValue={q} type="search" maxLength={200}/></label><button className="supplier-small-action" type="submit">Search</button></form></header>
    {result.error?<p role="alert">Unable to load archive. Please retry.</p>:<>{!result.data?.length&&<p>No {folder?'documents':'emails'} found. Historical import may still be running.</p>}{(result.data || []).map(row=>('file_name' in row)?<article className="supplier-file-row" key={row.id}><div className="supplier-file-copy"><span className="supplier-file-type">PDF</span><div><strong>{row.file_name}</strong><small>{(row.size_bytes/1024/1024).toFixed(2)} MB</small>{row.supplier_mail_attachments.map((link,i)=><p key={i}><Link href={`/documents/suppliers/${company}/emails/${link.message_id}`}>Source email{link.supplier_emails?` · ${new Date((Array.isArray(link.supplier_emails)?link.supplier_emails[0]:link.supplier_emails)?.received_at).toLocaleDateString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}`:""}</Link></p>)}</div></div><div className="supplier-file-actions"><SupplierDocumentFolder id={row.id} folder={row.folder}/><SupplierDocumentButton id={row.id}/></div></article>:<p className="supplier-email-row" key={row.id}><Link href={`/documents/suppliers/${company}/emails/${row.id}`}>{row.subject || '(No subject)'}</Link><br/><small>{new Date(row.received_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})}</small></p>)}<footer className="supplier-pagination"><span>{result.count || 0} total · Page {page}</span><div>{page>1&&<Link href={url(page-1)}>← Previous</Link>}{(result.count || 0)>offset+50&&<Link href={url(page+1)}>Next →</Link>}</div></footer></>}
    </section></div></AppShell>;
}
