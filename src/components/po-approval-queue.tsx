'use client';
import { useState } from 'react';
import { CheckCircle, FileSearch } from 'lucide-react';
type PendingPO={id:string;po_no:string;requested_by:string;revision:number};
export function PoApprovalQueue({orders,total}:{orders:PendingPO[];total:number}){
 const [rows,setRows]=useState(orders);const [count,setCount]=useState(total);const [busy,setBusy]=useState<string|null>(null);const [message,setMessage]=useState('');
 async function approve(order:PendingPO){
  if(busy||!window.confirm(`Approve and sign ${order.po_no} using your saved e-signature? Please review the PO first.`))return;
  setBusy(order.id);setMessage('');
  try{const res=await fetch(`/api/purchase-orders/${order.id}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:order.revision,useSignature:true})});const result=await res.json();if(!res.ok)throw Error(result.error);setRows(old=>old.filter(o=>o.id!==order.id));setCount(old=>Math.max(0,old-1));setMessage(`${order.po_no} approved. The PO creator has been notified.`);}catch(e){setMessage(e instanceof Error?e.message:'Unable to approve');}finally{setBusy(null);}
 }
 return <section className="panel" style={{marginBottom:20}}><div className="section-head"><div><h2>Purchase Orders awaiting your approval <span className="stock-state">{count}</span></h2><p className="subtle">Review the PO, then sign and approve as James Ooi. Save your signature in <a href="/account">Account</a> first.</p></div><a className="button secondary-button" href="/admin/inventory/purchase-orders">All Purchase Orders</a></div>{message&&<p role="status">{message}</p>}{rows.length?<div className="table-wrap"><table className="table"><thead><tr><th>PO No.</th><th>Requested by</th><th>Actions</th></tr></thead><tbody>{rows.map(o=><tr key={o.id}><td>{o.po_no}</td><td>{o.requested_by}</td><td><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a className="button secondary-button" href={`/admin/inventory/purchase-orders?po=${o.id}`}><FileSearch size={20} aria-hidden="true"/>Review PO</a><button className="button" disabled={!!busy} onClick={()=>approve(o)}><CheckCircle size={20} aria-hidden="true"/>{busy===o.id?'Signing…':'Approve & Sign'}</button></div></td></tr>)}</tbody></table></div>:<p className="subtle">{count?'Open All Purchase Orders to review the remaining POs.':'No purchase orders awaiting approval.'}</p>}</section>;
}
