import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {requireRole} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import type {OfficialReceipt} from '@/lib/official-receipt';
import '../records.css';
export const dynamic='force-dynamic';
export default async function ReceiptsPage({searchParams}:{searchParams:Promise<{q?:string}>}){
 const profile=await requireRole(['admin','management_viewer']);
 const {q=''}=await searchParams,search=q.trim().toLowerCase(),db=createAdminClient();
 const receipts:OfficialReceipt[]=[];let failed=false;
 for(let offset=0;;offset+=1000){
  const r=await db.from('official_receipts').select('*').order('paid_on',{ascending:false}).order('id').range(offset,offset+999);
  if(r.error){failed=true;break;}receipts.push(...r.data);if(r.data.length<1000)break;
 }
 const visible=receipts.filter(r=>!search||[r.payer,r.receipt_no,r.description,r.bank_reference,r.paid_on,r.kind].join(' ').toLowerCase().includes(search));
 const folders=new Map<string,OfficialReceipt[]>();
 for(const receipt of visible){const group=folders.get(receipt.payer)||[];group.push(receipt);folders.set(receipt.payer,group);}
 return <AppShell profile={profile} title="Receipts">
  <div className="business-documents">
   <Link className="business-document-back" href="/documents">← Documents</Link>
   <header>
    <div><h2>Official Receipts</h2><p>Receipts are filed automatically when payment is recorded.</p></div>
   </header>
   <form className="business-document-search">
    <label><span>Search by payer, receipt number, month or bank reference</span><input type="search" name="q" defaultValue={q} placeholder="Company / KLGCR/260001 / month"/></label>
    <div className="receipt-document-actions"><button className="button" type="submit">Search</button><Link className="button secondary" href="/documents/receipts">All receipts</Link></div>
   </form>
   {failed ? <p role="alert">Unable to load receipts. Please try again.</p> : <>
    <p className="business-document-note">{visible.length} receipts · {folders.size} payer folders</p>
    {!visible.length && <p>No receipts found.</p>}
    {[...folders].sort(([a],[b])=>a.localeCompare(b)).map(([payer,items])=><details key={payer} open={!!search}>
     <summary><strong>{payer}</strong> · {items.length} receipts</summary>
     <div className="business-document-table-wrap" role="region" aria-label={`Receipts for ${payer}`} tabIndex={0}>
      <table className="table receipt-document-table" role="table">
       <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Receipt no.</th><th scope="col" role="columnheader">Paid on</th><th scope="col" role="columnheader">Type</th><th scope="col" role="columnheader">Amount</th><th scope="col" role="columnheader">Email</th><th scope="col" role="columnheader">Documents</th></tr></thead>
       <tbody role="rowgroup">{items.map(r=>{
        const receiptUrl = `/api/finance?receipt=${encodeURIComponent(r.id)}`;
        return <tr key={r.id} role="row">
         <td role="cell" data-label="Receipt no."><a className="text-link" href={receiptUrl} target="_blank" rel="noreferrer">{r.receipt_no}</a><small>{r.description}</small></td>
         <td role="cell" data-label="Paid on">{r.paid_on}</td>
         <td role="cell" data-label="Type">{r.kind==='gym'?'Gym':r.kind==='utility'?'Utilities':r.kind==='billing'?'Rental & Utilities':'Rental'}</td>
         <td role="cell" data-label="Amount">RM {Number(r.amount).toFixed(2)}</td>
         <td role="cell" data-label="Email">{r.emailed_at?'Sent':'Pending'}</td>
         <td role="cell"><div className="receipt-document-actions"><a className="button secondary" href={receiptUrl} target="_blank" rel="noreferrer">View Receipt PDF</a>{r.proof_path && <a className="button secondary" href={`${receiptUrl}&proof=1`} target="_blank" rel="noreferrer">Payment proof</a>}</div></td>
        </tr>;
       })}</tbody>
      </table>
     </div>
    </details>)}
   </>}
  </div>
 </AppShell>;
}
