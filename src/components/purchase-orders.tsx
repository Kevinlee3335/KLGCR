'use client';
import { useState } from 'react';
import './purchase-orders.css';
import type { PurchaseOrder, PurchaseOrderInput } from '@/lib/purchase-orders/schema';
type Item={id:string;item_code:string;description:string;unit:string|null};
type Line=PurchaseOrderInput['items'][number]&{query:string};
export function PurchaseOrders({items,orders,requester,canCreate}:{items:Item[];orders:PurchaseOrder[];requester:string;canCreate:boolean}) {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur'}).format(new Date());
 const blank=():Line=>({itemId:'',query:'',specification:'',quantity:1,location:''});
 const [lines,setLines]=useState<Line[]>([blank()]);const [date,setDate]=useState(today);
 const [name,setName]=useState(requester);const [approved,setApproved]=useState('');
 const [requestedDate,setRequestedDate]=useState(today);const [approvedDate,setApprovedDate]=useState('');
 const [records,setRecords]=useState(orders);const [search,setSearch]=useState('');
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [saved,setSaved]=useState<PurchaseOrder|null>(null);
 const [requestId,setRequestId]=useState('');
 const [editing,setEditing]=useState<PurchaseOrder|null>(null);
 function edit(order:PurchaseOrder){setEditing(order);setSaved(null);setRequestId('');setDate(order.order_date);setName(order.requested_by);setApproved(order.approved_by);setRequestedDate(order.requested_date);setApprovedDate(order.approved_date);setLines(order.items.map(item=>({...item,query:item.description})));setMessage('');window.scrollTo({top:0,behavior:'smooth'});}
 function reset(){setEditing(null);setSaved(null);setRequestId('');setDate(today);setName(requester);setApproved('');setRequestedDate(today);setApprovedDate('');setLines([blank()]);setMessage('');}
 const change=(i:number,patch:Partial<Line>)=>setLines(old=>old.map((l,n)=>i===n?{...l,...patch}:l));
 async function save(e:React.FormEvent){e.preventDefault();if(busy||saved)return;setBusy(true);setMessage('');
  const key=requestId||crypto.randomUUID();setRequestId(key);
  try {const res=await fetch('/api/purchase-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:editing?.id,expectedRevision:editing?.revision||1,requestId:key,date,requestedBy:name,approvedBy:approved,requestedDate,approvedDate,items:lines.map(l=>({itemId:l.itemId,specification:l.specification,quantity:l.quantity,location:l.location}))})});
   const result=await res.json();if(!res.ok)throw Error(result.error||'Unable to save');
   setSaved(result.order);setRecords(old=>[result.order,...old.filter(o=>o.id!==result.order.id)]);setMessage(`${result.order.po_no} saved. Downloading PDF…`);
   window.location.assign(`/api/purchase-orders/${result.order.id}/pdf`);
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to save. Please retry.');}finally{setBusy(false);}
 }
 return <div className="po-workspace">
 {canCreate&&<section className="panel"><div className="section-head"><div><h2>{editing?`Edit ${editing.po_no}`:"Create Purchase Order"}</h2><p className="subtle">Search inventory items, enter quantities and save your PO.</p></div><span className="stock-state">K HOTEL / KLGCR</span></div>
 <form onSubmit={save}>
 <fieldset disabled={busy||!!saved} style={{border:0,padding:0,margin:0}}>
 <div className="po-fields"><label>PO Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label>Requested by<input value={name} maxLength={100} onChange={e=>setName(e.target.value)} required/></label><label>Requested Date<input type="date" value={requestedDate} onChange={e=>setRequestedDate(e.target.value)}/></label><label>Approved By<input value={approved} maxLength={100} onChange={e=>setApproved(e.target.value)}/></label><label>Approved Date<input type="date" value={approvedDate} onChange={e=>setApprovedDate(e.target.value)}/></label></div>
 <div className="table-wrap"><table className="table po-table"><thead><tr><th>No.</th><th>Item Code / Description</th><th>Specification</th><th>Quantity</th><th>Unit</th><th>Location</th><th>Action</th></tr></thead><tbody>{lines.map((l,i)=>{
 const oldItem=editing?.items.find(it=>it.itemId===l.itemId);
 const selected=items.find(it=>it.id===l.itemId)||(oldItem?{id:oldItem.itemId,item_code:oldItem.code,description:oldItem.description,unit:oldItem.unit}:undefined);const term=l.query.trim().toLowerCase();
 const matches=!selected&&term?items.filter(it=>`${it.item_code} ${it.description}`.toLowerCase().includes(term)).slice(0,12):[];
 return <tr key={i}><td>{i+1}</td><td className="po-item-cell"><div className="po-item-search"><input aria-label={`Item ${i+1}`} value={l.query} maxLength={200} placeholder="Type win or item code…" onChange={e=>change(i,{query:e.target.value,itemId:''})} required/>{selected&&<small className="po-item-code">{selected.item_code}</small>}{!selected&&term&&<div className="po-item-results">{matches.length?matches.map(it=><button className="po-item-option" type="button" key={it.id} onClick={()=>change(i,{itemId:it.id,query:it.description})}><span>{it.description}</span><small>{it.item_code}</small></button>):<p>No matching inventory item.</p>}</div>}</div></td><td><input aria-label={`Specification ${i+1}`} maxLength={200} value={l.specification} onChange={e=>change(i,{specification:e.target.value})}/></td><td><input aria-label={`Quantity ${i+1}`} type="number" min="0.01" max="1000000" step="0.01" required value={l.quantity} onChange={e=>change(i,{quantity:Number(e.target.value)})} className="po-quantity"/></td><td>{selected?.unit||'—'}</td><td><select aria-label={`Location ${i+1}`} value={l.location} onChange={e=>change(i,{location:e.target.value})}><option value="">Select location</option>{["Block A","Block B","Block C","Block D","External Area"].map(location=><option key={location} value={location}>{location}</option>)}</select></td><td><button className="button secondary-button" type="button" disabled={lines.length===1} onClick={()=>setLines(old=>old.filter((_,n)=>n!==i))} aria-label={`Remove row ${i+1}`} title="Remove row">−</button></td></tr>;
 })}</tbody></table></div>
 <div className="section-head" style={{marginTop:14}}><button className="button secondary-button" type="button" disabled={lines.length>=100} onClick={()=>setLines(old=>[...old,blank()])}>＋ Add Row</button><button className="button" type="submit" disabled={lines.some(l=>!l.itemId)}>{busy?'Saving…':editing?'Save Changes & Download PDF':'Save & Download PDF'}</button></div>
 </fieldset></form>
 {editing&&!saved&&<button className="button secondary-button" type="button" disabled={busy} onClick={reset}>Cancel Edit</button>}{message&&<p role="status">{message}</p>}{saved&&<div className="section-head"><a className="button" href={`/api/purchase-orders/${saved.id}/pdf`}>Download PDF</a><button className="button secondary-button" onClick={reset}>New Purchase Order</button></div>}
 </section>}
 <section className="panel"><div className="section-head"><div><h2>Saved Purchase Orders</h2><p className="subtle">PO records stay in the system. Download the PDF again anytime.</p></div><input type="search" aria-label="Search purchase orders" placeholder="PO number, item code or name…" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="table-wrap"><table className="table po-table"><thead><tr><th>PO No.</th><th>Date</th><th>Requested by</th><th>Items</th><th>Actions</th></tr></thead><tbody>{records.filter(o=>`${o.po_no} ${o.requested_by} ${o.items.map(i=>`${i.code} ${i.description}`).join(' ')}`.toLowerCase().includes(search.toLowerCase())).map(o=><tr key={o.id}><td><strong>{o.po_no}</strong></td><td>{o.order_date}</td><td>{o.requested_by}</td><td>{o.items.map(i=>`${i.code} · ${i.description} × ${i.quantity}`).join('; ')}</td><td><div className="po-record-actions">{canCreate&&<button className="button secondary-button" type="button" disabled={busy} onClick={()=>edit(o)}>Edit</button>}<a className="button secondary-button" href={`/api/purchase-orders/${o.id}/pdf`}>PDF</a></div><small className="po-item-code">Revision {o.revision||1}</small></td></tr>)}</tbody></table>{!records.length&&<p>No purchase orders saved yet.</p>}</div></section>
 </div>;
}
