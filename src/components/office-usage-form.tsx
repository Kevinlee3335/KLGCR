'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {OfficeItem,OfficeUsage} from '@/lib/office-inventory/model';
export function OfficeUsageForm({items,name}:{items:OfficeItem[];name:string}){
 const router=useRouter(),requestId=useRef('');
 const [itemId,setItemId]=useState(''),[quantity,setQuantity]=useState(''),[takenBy,setTakenBy]=useState(name),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState<OfficeUsage|null>(null);
 const selected=items.find(i=>i.id===itemId);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy||saved)return;setBusy(true);setMessage('');requestId.current ||= crypto.randomUUID();
  try{const res=await fetch('/api/office-inventory/usage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:requestId.current,itemId,quantity:Number(quantity),takenBy,note})}),data=await res.json();if(!res.ok)throw Error(data.error||'Unable to record supplies');setSaved(data.usage);setMessage(`Recorded successfully. Remaining stock: ${data.usage.balance_after} ${data.usage.unit||''}`);router.refresh();}
  catch(error){setMessage(error instanceof Error?error.message:'Unable to record supplies. Retry the same entry.');}finally{setBusy(false);}
 }
 return <div><form onSubmit={submit}><fieldset disabled={busy||!!saved} style={{border:0,padding:0,margin:0}}><div className="inventory-form">
 <label><span>Taken by</span><input value={takenBy} onChange={e=>setTakenBy(e.target.value)} maxLength={100} required autoComplete="name"/></label>
 <label className="span-2"><span>Office item</span><select value={itemId} onChange={e=>{setItemId(e.target.value);setQuantity('');}} required><option value="">Select supplies…</option>{items.map(i=><option key={i.id} value={i.id} disabled={i.quantity_unverified||Number(i.balance_qty)<=0}>{i.item_code} · {i.description} · {i.quantity_unverified?'Quantity needs confirmation':`${i.balance_qty} ${i.unit||''} available`}</option>)}</select></label>
 <label><span>Quantity taken{selected?.unit?` (${selected.unit})`:''}</span><input type="number" inputMode="decimal" min="0.01" step="0.01" max={selected?Number(selected.balance_qty):undefined} value={quantity} onChange={e=>setQuantity(e.target.value)} required/></label>
 <label className="span-2"><span>Remarks (optional)</span><input value={note} onChange={e=>setNote(e.target.value)} maxLength={500} placeholder="Purpose or department"/></label>
 <div className="span-2"><button className="button" disabled={!selected||selected.quantity_unverified||busy} type="submit">{busy?'Recording…':'Record Supplies Taken'}</button></div>
 </div></fieldset></form>{message&&<p role="status" className={saved?'success':'error'}>{message}</p>}{saved&&<button className="button secondary-button" type="button" onClick={()=>{setSaved(null);setMessage('');setItemId('');setQuantity('');setNote('');requestId.current='';}}>Record Another Item</button>}</div>;
}
