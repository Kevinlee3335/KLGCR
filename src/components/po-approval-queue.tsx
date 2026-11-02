'use client';
import { useState } from 'react';
import { CheckCircle, FileSearch } from 'lucide-react';
type PendingPO={id:string;po_no:string;requested_by:string;revision:number};
type PendingReport={id:string;month:string;kind:string};
export function PoApprovalQueue({orders,total,reports=[],reportTotal=0,reportError=false}:{orders:PendingPO[];total:number;reports?:PendingReport[];reportTotal?:number;reportError?:boolean}){
 const [rows,setRows]=useState(orders);const [count,setCount]=useState(total);const [busy,setBusy]=useState<string|null>(null);const [message,setMessage]=useState('');
 async function approve(order:PendingPO){
  if(busy||!window.confirm(`Approve ${order.po_no} as James Ooi? Please review the PO first.`))return;
  setBusy(order.id);setMessage('');
  try{const res=await fetch(`/api/purchase-orders/${order.id}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:order.revision})});const result=await res.json();if(!res.ok)throw Error(result.error);setRows(old=>old.filter(o=>o.id!==order.id));setCount(old=>Math.max(0,old-1));setMessage(`${order.po_no} approved. The PO creator has been notified.`);}catch(e){setMessage(e instanceof Error?e.message:'Unable to approve');}finally{setBusy(null);}
 }
 return <section className="panel" style={{marginBottom:20}}><div className="section-head"><div><h2>Requires your approval <span className="stock-state">{count+reportTotal}</span></h2><p className="subtle">Review your pending documents and open each item to approve.</p></div><a className="button secondary-button" href="/admin/inventory/purchase-orders">All Purchase Orders</a></div>{message&&<p role="status">{message}</p>}{reportError&&<p role="alert">Unable to load Gym reports. Please refresh.</p>}{rows.length||reports.length?<div className="table-wrap"><table className="table"><thead><tr><th>Document</th><th>Reference / Month</th><th>Requested by</th><th>Actions</th></tr></thead><tbody>
 {rows.map(o=><tr key={o.id}><td>Purchase Order</td><td>{o.po_no}</td><td>{o.requested_by}</td><td><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a className="button secondary-button" href={`/admin/inventory/purchase-orders?po=${o.id}`}><FileSearch size={20} aria-hidden="true"/>Review PO</a><button className="button" disabled={!!busy} onClick={()=>approve(o)}><CheckCircle size={20} aria-hidden="true"/>{busy===o.id?'Approving…':'Approve'}</button></div></td></tr>)}
 {reports.map(r=><tr key={r.id}><td>{r.kind==='committee'?'Sports Committee Report':'Monthly Payment List'}</td><td>{new Date(r.month+'T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'})}</td><td>Gym Membership</td><td><a className="button secondary-button" href={`/admin/members/report-approvals#report-${r.id}`}><FileSearch size={20} aria-hidden="true"/>Review &amp; approve</a></td></tr>)}
 </tbody></table></div>:<p className="subtle">No documents awaiting your approval.</p>}
 {reportTotal>reports.length&&<a className="text-link" href="/admin/members/report-approvals">View all pending Gym reports</a>}
 {count>rows.length&&<p className="subtle">Open All Purchase Orders to review the remaining POs.</p>}</section>;
}
