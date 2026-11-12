'use client';
import { useEffect, useState } from 'react';
import type { PurchaseOrder } from '@/lib/purchase-orders/schema';
import { receivingLines,type GoodsReceipt } from '@/lib/purchase-orders/receipts';
type ReceivingHistory = { status: 'loading' | 'error' } | { status: 'loaded'; receipts: GoodsReceipt[] };

export function GoodsReceiving({order,onUpdate,onClose}:{order:PurchaseOrder;onUpdate:(order:PurchaseOrder)=>void;onClose:()=>void}){
 const [quantities,setQuantities]=useState<Record<string,string>>({});const [note,setNote]=useState('');const [busy,setBusy]=useState(false);const [requestId,setRequestId]=useState('');const [message,setMessage]=useState('');
 const [history, setHistory] = useState<ReceivingHistory>({ status: 'loading' });
 const [historyAttempt, setHistoryAttempt] = useState(0);
 const [updatedReceipts, setUpdatedReceipts] = useState<GoodsReceipt[]>([]);
 const orderId = order.id;

 useEffect(() => {
   const controller = new AbortController();
   async function loadHistory() {
     try {
       const response = await fetch(`/api/purchase-orders/receive?orderId=${encodeURIComponent(orderId)}`, { signal: controller.signal });
       if (!response.ok) throw Error('Unable to load receiving history.');
       const result: { receipts: GoodsReceipt[] } = await response.json();
       if (!controller.signal.aborted) setHistory({ status: 'loaded', receipts: result.receipts });
     } catch {
       if (!controller.signal.aborted) setHistory({ status: 'error' });
     }
   }
   void loadHistory();
   return () => controller.abort();
 }, [orderId, historyAttempt]);

 const updatedReceiptIds = new Set(updatedReceipts.map(receipt => receipt.id));
 const receipts = history.status === 'loaded'
   ? [...updatedReceipts, ...history.receipts.filter(receipt => !updatedReceiptIds.has(receipt.id))]
   : updatedReceipts;
 const lines=receivingLines(order);const pending=receipts.filter(r=>r.sheet_status!=='synced');
 async function submit(event:React.FormEvent){event.preventDefault();if(busy)return;const items=lines.map(l=>({itemId:l.itemId,quantity:Number(quantities[l.itemId]||0)})).filter(l=>l.quantity>0);
  if(!items.length){setMessage('Enter the quantity received for at least one item.');return;}
  const key=requestId||crypto.randomUUID();setRequestId(key);await send({action:'receive',orderId:order.id,expectedRevision:order.revision||1,requestId:key,note,items});
 }
 async function send(body: unknown) {
   setBusy(true);
   setMessage('');
   try {
     const response = await fetch('/api/purchase-orders/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
     const result: { order: PurchaseOrder; receipt: GoodsReceipt; message: string; error?: string } = await response.json();
     if (!response.ok) throw Error(result.error);
     onUpdate(result.order);
     setUpdatedReceipts(previous => [result.receipt, ...previous.filter(receipt => receipt.id !== result.receipt.id)]);
     setMessage(result.message);
     setQuantities({});
     setNote('');
     setRequestId('');
   } catch (error) {
     setMessage(error instanceof Error ? error.message : 'Unable to save. Please retry.');
   } finally {
     setBusy(false);
   }
 }
 return <section className="panel po-receiving" aria-label="Receive purchase order goods"><div className="section-head"><div><h2>Receive Goods · {order.po_no}</h2><p className="subtle">Enter only the quantity arriving now. Confirming adds it to Inventory and syncs Google Sheet.</p></div><button className="button secondary-button" type="button" onClick={onClose} disabled={busy}>Close</button></div>
 <form onSubmit={submit}><fieldset disabled={busy} style={{border:0,padding:0,margin:0}}><div className="table-wrap"><table className="table po-table po-receive-table"><thead><tr><th>Item</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Arrived Now</th></tr></thead><tbody>{lines.map(line=><tr key={line.itemId}><td>{line.description}<small className="po-item-code">{line.code} · {line.unit}</small></td><td>{line.ordered}</td><td>{line.received}</td><td>{line.remaining}</td><td><input aria-label={`Arrival quantity ${line.code}`} type="number" min="0" max={line.remaining} step="0.01" disabled={line.remaining===0} value={quantities[line.itemId]||''} placeholder="0" onChange={e=>setQuantities(old=>({...old,[line.itemId]:e.target.value}))}/></td></tr>)}</tbody></table></div><label className="po-receive-note">Delivery note / Remarks<input maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional delivery note number or remarks"/></label><button className="button" type="submit" disabled={lines.every(l=>l.remaining===0)}>{busy?'Saving…':'Confirm Received & Update Stock'}</button></fieldset></form>
 {message&&<p role="status" className="po-receive-message">{message}</p>}
 {pending.length>0&&<div className="po-sync-pending"><strong>Google Sheet sync pending</strong><p>Stock is already saved. Retrying sync will not add stock again.</p>{pending.map(receipt=><div key={receipt.id}><span>{new Date(receipt.received_at).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})}</span><button className="button secondary-button" disabled={busy} onClick={()=>send({action:'retry_sync',receiptId:receipt.id})}>Retry Google Sync</button>{receipt.sheet_error&&<small>{receipt.sheet_error}</small>}</div>)}</div>}
 <h3>Receiving History</h3>
 {history.status === 'loading' && <p role="status" className="subtle">Loading receiving history…</p>}
 {history.status === 'error' && <div><p role="alert" className="error">Unable to load receiving history.</p><button className="button secondary-button" type="button" onClick={() => {
   setHistory({ status: 'loading' });
   setHistoryAttempt(attempt => attempt + 1);
 }}>Retry History</button></div>}
 {history.status === 'loaded' && !receipts.length && <p className="subtle">No deliveries recorded yet.</p>}
 {receipts.map(receipt=><article className="po-receipt-record" key={receipt.id}><strong>{new Date(receipt.received_at).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})}</strong><span>{receipt.sheet_status==='synced'?'Google Sheet synced':'Google Sheet pending'}</span>{receipt.items.map(item=><div key={item.itemId}>{item.description} · +{item.quantity}<small className="po-item-code">{item.code}</small></div>)}{receipt.note&&<p>{receipt.note}</p>}</article>)}
 </section>;
}
