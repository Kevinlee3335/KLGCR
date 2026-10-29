import {AppShell} from '@/components/app-shell';
import {requireRole} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import type {OfficialReceipt} from '@/lib/official-receipt';
import '../documents.css';
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
 return <AppShell profile={profile} title="Receipts"><section className="card"><a href="/documents">← Documents</a><h2>Official Receipts</h2><p>Receipts are filed automatically when payment is recorded. Search by payer, receipt number, payment month or bank reference.</p><form><label>Search receipts <input name="q" defaultValue={q} placeholder="Company / KLGCR/260001 / month"/></label> <button type="submit">Search</button> <a href="/documents/receipts">All receipts</a></form>{failed?<p role="alert">Unable to load receipts. Please try again.</p>:<><p>{visible.length} receipts · {folders.size} payer folders</p>{!visible.length&&<p>No receipts found.</p>}{[...folders].sort(([a],[b])=>a.localeCompare(b)).map(([payer,items])=><details key={payer} open={!!search}><summary><strong>{payer}</strong> · {items.length} receipts</summary><div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left',borderSpacing:'12px'}}><thead><tr><th>Receipt no.</th><th>Paid on</th><th>Type</th><th>Amount</th><th>Email</th><th>Documents</th></tr></thead><tbody>{items.map(r=><tr key={r.id}><td><a href={'/api/finance?receipt='+encodeURIComponent(r.id)} target="_blank" rel="noreferrer">{r.receipt_no}</a><p>{r.description}</p></td><td>{r.paid_on}</td><td>{r.kind==='gym'?'Gym':r.kind==='utility'?'Utilities':'Rental'}</td><td>RM {Number(r.amount).toFixed(2)}</td><td>{r.emailed_at?'Sent':'Pending'}</td><td><a href={'/api/finance?receipt='+encodeURIComponent(r.id)} target="_blank" rel="noreferrer">View Receipt PDF</a>{r.proof_path&&<> · <a href={'/api/finance?receipt='+encodeURIComponent(r.id)+'&proof=1'} target="_blank" rel="noreferrer">Payment proof</a></>}</td></tr>)}</tbody></table></div></details>)}</>}</section></AppShell>;
}
