import Link from 'next/link';
import '../../../supplier-mail.css';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { SupplierDocumentButton } from '@/components/supplier-document-button';
import { SupplierEmailRead } from '@/components/supplier-email-read';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { suppliers, mailbox, type Supplier } from '@/lib/supplier-mail/rules';
export default async function SupplierEmail({params}:{params:Promise<{company:string;id:string}>}) {
  const profile=await requireRole(['admin','management_viewer']);
  const {company,id}=await params;
  if(!Object.hasOwn(suppliers,company)||!/^[0-9a-f]{10,40}$/.test(id))notFound();
  const db=await createClient();
  const result=await db.from('supplier_emails').select('*').eq('company',company).eq('id',id).maybeSingle();
  if(result.error)return <AppShell profile={profile} title="Supplier email"><p role="alert">Unable to load email.</p></AppShell>;
  const email=result.data;if(!email)notFound();
  const attachments=await db.from('supplier_mail_attachments').select('file_name,document_id,issue').eq('message_id',id);
  return <AppShell profile={profile} title={suppliers[company as Supplier].name}><SupplierEmailRead id={id}/><div className="supplier-archive supplier-email-detail"><p><Link className="supplier-back" href={`/documents/suppliers/${company}`}>← Company emails</Link></p><section className="supplier-records supplier-message"><h2>{email.subject || '(No subject)'}</h2><p>From: {email.sender}<br/>{new Date(email.received_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})}</p><a className="supplier-small-action" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mailbox)}#all/${id}`} target="_blank" rel="noreferrer">Open original in Gmail</a><div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:24}}>{email.body_text || 'Open the original email to view formatted content.'}</div></section><section className="supplier-records supplier-message"><h2>PDF attachments</h2>{attachments.error?<p role="alert">Unable to load attachments.</p>:<>{!attachments.data?.length&&<p>No archived PDF attachments yet. Synchronization may still be processing this email.</p>}{attachments.data?.map((file,i)=><p key={i}><strong>{file.file_name}</strong> {file.document_id?<SupplierDocumentButton id={file.document_id}/>:<span>{file.issue || 'Awaiting download'}</span>}</p>)}</>}</section></div></AppShell>;
}
