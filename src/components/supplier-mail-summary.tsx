import Link from 'next/link';
import { recentSupplierEmails } from '@/lib/supplier-mail/queries';
import { createClient } from '@/lib/supabase/server';
import { suppliers, type Supplier } from '@/lib/supplier-mail/rules';
export async function SupplierMailSummary() {
  const result=await recentSupplierEmails();
  if(result.error || !result.data?.length) return null;
  const rows=result.data || [];
  const db=await createClient();
  const reads=rows.length?await db.from('supplier_email_reads').select('message_id').in('message_id',rows.map(r=>r.id)):{data:[],error:null};
  const seen=new Set((reads.data || []).map(r=>r.message_id));
  return <section className="panel"><div className="section-heading"><h2>Supplier emails today</h2><Link href="/documents/suppliers">View company folders →</Link></div>
    {rows.map(row=><p key={row.id}><Link href={`/documents/suppliers/${row.company}/emails/${row.id}`}><strong>{suppliers[row.company as Supplier]?.name}</strong> · {row.subject || '(No subject)'}</Link> {!reads.error&&!seen.has(row.id)&&<span className="badge">New</span>}<br/><small>{new Date(row.received_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})}</small></p>)}
  </section>;
}
