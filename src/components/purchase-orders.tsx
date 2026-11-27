'use client';
import { activePODraftStore, readPODraft, writePODraft } from '@/lib/po-draft';
import { itemBalance, balanceLabel } from '@/lib/purchase-orders/balance';
import { SignaturePad } from './signature-pad';
import { recentPurchaseOrders } from '@/lib/business-documents';
import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, PackageCheck, Eye, CheckCircle } from 'lucide-react';
import './purchase-orders.css';
import { GoodsReceiving } from './po-receiving';
import { receivingLines } from '@/lib/purchase-orders/receipts';
import type { PurchaseOrder, PurchaseOrderInput } from '@/lib/purchase-orders/schema';
type Item={id:string;item_code:string;description:string;unit:string|null;balance_qty?:number|string|null;stock_group?:string|null;inventory_group?:string;quantity_unverified?:boolean};
type Line=PurchaseOrderInput['items'][number]&{query:string};

type DraftLine = { itemId: string; quantity: number };
type RowResult<T> = { rows: T[]; failed: boolean };
type RowSource<T> = T[] | Promise<RowResult<T>>;
type DispatchRow = { order_id: string; revision: number; status: string; error?: string | null; sent_at?: string | null };
type DeliveryInfo = { byRevision: Record<string, DispatchRow>; failed: boolean };
type SourceProps = { items: RowSource<Item>; orders: RowSource<PurchaseOrder>; dispatches?: RowSource<DispatchRow> };
type Access = { requester: string; canCreate: boolean; viewerId?: string; canApprove?: boolean };
type FormActions = { busy: boolean; setBusy: (value: boolean) => void; message: string; setMessage: (value: string) => void };
const noDispatches: DispatchRow[] = [];
const noDraft: DraftLine[] = [];
const blank = (): Line => ({ itemId: '', query: '', specification: '', quantity: 1, location: '' });
const itemStore = (code: string) => code.startsWith('OFF-') ? 'office' : code.startsWith('CLN-') ? 'cleaner' : 'building';

function useRows<T>(source: RowSource<T>): RowResult<T> {
  return Array.isArray(source) ? { rows: source, failed: false } : use(source);
}

function validDraft(raw: string | undefined, items: Item[]): DraftLine[] {
  if (!raw) return [];
  try {
    const input: unknown = JSON.parse(raw);
    if (!Array.isArray(input) || input.length > 100) return [];
    const storeById = new Map(items.map(item => [item.id, itemStore(item.item_code)]));
    const valid = input.filter((line): line is DraftLine => !!line && typeof line.itemId === 'string'
      && typeof line.quantity === 'number' && Number.isFinite(line.quantity) && line.quantity >= 0.01
      && line.quantity <= 1000000 && storeById.has(line.itemId));
    return new Set(valid.map(line => storeById.get(line.itemId))).size <= 1 ? valid : [];
  } catch {
    return [];
  }
}

export function PurchaseOrders({ items, orders, requester, canCreate, canApprove = false, viewerId = '',
  dispatches = noDispatches, dispatchUnavailable = false, initialSearch = '', initialItems = noDraft, draft, orderId }: SourceProps & Access & {
    dispatchUnavailable?: boolean; initialSearch?: string; initialItems?: DraftLine[]; draft?: string; orderId?: string;
  }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState<{ order: PurchaseOrder | null; version: number }>({ order: null, version: 0 });
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [updates, setUpdates] = useState<PurchaseOrder[]>([]);
  const delivery = useMemo(() => {
    const index = ({ rows, failed }: RowResult<DispatchRow>): DeliveryInfo => ({
      byRevision: Object.fromEntries(rows.map(row => [`${row.order_id}:${row.revision}`, row])),
      failed: failed || dispatchUnavailable,
    });
    return Array.isArray(dispatches) ? index({ rows: dispatches, failed: false }) : Promise.resolve(dispatches).then(index);
  }, [dispatches, dispatchUnavailable]);

  function updateOrder(order: PurchaseOrder) {
    setUpdates(previous => [order, ...previous.filter(row => row.id !== order.id)]);
    setReceivingOrder(open => open?.id === order.id ? order : open);
  }
  function edit(order: PurchaseOrder | null) {
    setEditor(previous => ({ order, version: previous.version + 1 }));
    setMessage('');
    if (order) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
 async function approve(order:PurchaseOrder){
 if(busy||!window.confirm(`Approve ${order.po_no} using your saved signature? Please review the PDF first.`))return;
 setBusy(true);setMessage('');
 try{const res=await fetch(`/api/purchase-orders/${order.id}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:order.revision||1})});const result=await res.json();if(!res.ok)throw Error(result.error);updateOrder(result.order);setMessage(result.deliveryWarning||`${order.po_no} approved. The approved PDF is ready.`);}catch(e){setMessage(e instanceof Error?e.message:'Unable to approve');}finally{setBusy(false);}
 }
  const formActions = { busy, setBusy, message, setMessage };
  return <div className="po-workspace">
    <SignaturePad />
    {canCreate && <Suspense fallback={<section className="panel"><h2>Create Purchase Order</h2><p role="status">Loading inventory items…</p></section>}>
      <FormSection key={editor.version} source={items} requester={requester} editing={editor.order} useDraft={editor.version === 0}
        initialItems={initialItems} draft={draft} reset={() => edit(null)} onSave={updateOrder} {...formActions} />
    </Suspense>}
    {receivingOrder && <GoodsReceiving key={receivingOrder.id} order={receivingOrder} onUpdate={updateOrder} onClose={() => setReceivingOrder(null)} />}
    <Suspense fallback={<section className="panel"><h2>Saved Purchase Orders</h2><p role="status">Loading purchase orders…</p></section>}>
      <History source={orders} updates={updates} initialSearch={initialSearch} orderId={orderId} delivery={delivery}
        busy={busy} canCreate={canCreate} viewerId={viewerId} canApprove={canApprove} approve={approve} edit={edit}
        receive={order => { setReceivingOrder(order); requestAnimationFrame(() => document.querySelector('.po-receiving')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} />
    </Suspense>
  </div>;
}

type FormProps = FormActions & {
  requester: string; editing: PurchaseOrder | null; useDraft: boolean; initialItems: DraftLine[];
  reset: () => void; onSave: (order: PurchaseOrder) => void;
};

function FormSection({ source, draft, ...props }: FormProps & { source: RowSource<Item>; draft?: string }) {
  const { rows, failed } = useRows(source);
  const initialItems = useMemo(() => props.useDraft ? (draft ? validDraft(draft, rows) : props.initialItems) : noDraft,
    [props.useDraft, props.initialItems, draft, rows]);
  if (failed) return <><p className="error">Unable to load inventory items.</p>{props.message && <p role="status">{props.message}</p>}</>;
  return <OrderForm {...props} items={rows} initialItems={initialItems} />;
}

function OrderForm({ items, requester, initialItems, editing, useDraft, onSave, reset, busy, setBusy, message, setMessage }: FormProps & { items: Item[] }) {
 const [today] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()));
 const [lines, setLines] = useState<Line[]>(() => editing ? editing.items.map(item => ({ ...item, query: item.description })) :
   initialItems.length ? initialItems.map(line => ({ ...line, query: items.find(item => item.id === line.itemId)?.description || '', specification: '', location: '' })) : [blank()]);
 const [date, setDate] = useState(editing?.order_date || today);
 const [store, setStore] = useState(() => itemStore(editing?.items[0]?.code ?? items.find(item => item.id === initialItems[0]?.itemId)?.item_code ?? ''));
 const [name, setName] = useState(editing?.requested_by ?? requester);
 const requestedDate = editing?.requested_date ?? today;
 const [saved, setSaved] = useState<PurchaseOrder | null>(null);
 const itemsById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
 const balanceItems = useMemo(() => items.map(item => ({...item, balance_qty: item.balance_qty ?? null})), [items]);
 const restored = useRef(false);
 useEffect(()=>{
  if(restored.current || !useDraft || initialItems.length)return;
  restored.current = true;
  const draftStore=activePODraftStore();
  const draft=readPODraft(draftStore).filter(line=>items.some(item=>item.id===line.itemId&&itemStore(item.item_code)===draftStore));
  if(draft.length){setStore(draftStore);setLines(draft.map(line=>({...line,query:items.find(item=>item.id===line.itemId)!.description,specification:'',location:''})));setMessage(`${draft.length} items loaded from your Inventory PO list.`);}
 },[initialItems.length, items, setMessage, useDraft]);
 const [requestId,setRequestId]=useState('');
 const change=(i:number,patch:Partial<Line>)=>setLines(old=>old.map((l,n)=>i===n?{...l,...patch}:l));
 async function save(e:React.FormEvent){e.preventDefault();if(busy||saved)return;setBusy(true);setMessage('');
  const key=requestId||crypto.randomUUID();setRequestId(key);
  try {const res=await fetch('/api/purchase-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:editing?.id,expectedRevision:editing?.revision||1,requestId:key,date,useSignature:true,requestedBy:name,approvedBy:'',requestedDate,approvedDate:'',items:lines.map(l=>({itemId:l.itemId,specification:l.specification,quantity:l.quantity,location:l.location}))})});
   const result=await res.json();if(!res.ok)throw Error(result.error||'Unable to save');
   try{const submitted=new Set(lines.map(line=>line.itemId));writePODraft(store,readPODraft(store).filter(line=>!submitted.has(line.itemId)));}catch{/* The PO is already saved; browser storage must not turn success into an error. */}
   setSaved(result.order);onSave(result.order);setMessage(`${result.order.po_no} saved successfully. You can review the PO below.`);
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to save. Please retry.');}finally{setBusy(false);}
 }
 return <section className="panel"><div className="section-head"><div><h2>{editing?`Edit ${editing.po_no}`:"Create Purchase Order"}</h2><p className="subtle">Search inventory items, enter quantities and save your PO.</p></div><span className="stock-state">K HOTEL / KLGCR</span></div>
 <form onSubmit={save}>
 <fieldset disabled={busy||!!saved} style={{border:0,padding:0,margin:0}}>
 <div className="po-fields"><label>Inventory<select value={store} onChange={e=>{if(lines.some(l=>l.itemId)&&!window.confirm("Change inventory and clear selected items?"))return;setStore(e.target.value);setLines([blank()]);}}><option value="building">Building Material · James approval</option><option value="office">Office Inventory · Mary approval</option><option value="cleaner">Cleaner Supplies · Mary approval</option></select></label><label>PO Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label>Requested by<input value={name} maxLength={100} onChange={e=>setName(e.target.value)} required/></label></div>
 <div className="table-wrap"><table className="table po-table"><thead><tr><th>No.</th><th>Item Code / Description</th><th>Specification</th><th>Quantity</th><th>Unit</th><th>Location</th><th>Action</th></tr></thead><tbody>{lines.map((l,i)=>{
 const oldItem=editing?.items.find(it=>it.itemId===l.itemId);
 const selected=itemsById.get(l.itemId)||(oldItem?{id:oldItem.itemId,item_code:oldItem.code,description:oldItem.description,unit:oldItem.unit}:undefined);const term=l.query.trim().toLowerCase();
 const matches=!selected&&term?items.filter(it=>itemStore(it.item_code)===store).filter(it=>`${it.item_code} ${it.description}`.toLowerCase().includes(term)).slice(0,12):[];
 return <tr key={i}><td>{i+1}</td><td className="po-item-cell"><div className="po-item-search"><input aria-label={`Item ${i+1}`} value={l.query} maxLength={200} placeholder="Type win or item code…" onChange={e=>change(i,{query:e.target.value,itemId:''})} required/>{selected&&<small className="po-item-code">{selected.item_code}</small>}{selected&&<ItemBalance items={balanceItems} id={selected.id} unit={selected.unit}/>}{!selected&&term&&<div className="po-item-results">{matches.length?matches.map(it=><button className="po-item-option" type="button" key={it.id} onClick={()=>change(i,{itemId:it.id,query:it.description})}><span>{it.description}</span><small>{it.item_code}</small></button>):<p>No matching inventory item.</p>}</div>}</div></td><td><input aria-label={`Specification ${i+1}`} maxLength={200} value={l.specification} onChange={e=>change(i,{specification:e.target.value})}/></td><td><input aria-label={`Quantity ${i+1}`} type="number" min="0.01" max="1000000" step="0.01" required value={l.quantity} onChange={e=>change(i,{quantity:Number(e.target.value)})} className="po-quantity"/></td><td>{selected?.unit||'—'}</td><td><select aria-label={`Location ${i+1}`} value={l.location} onChange={e=>change(i,{location:e.target.value})}><option value="">Select location</option>{["Block A","Block B","Block C","Block D","BLK A&B","BLK C&D","BLK A-D","External Area","Carpark","Futsal","Gym","Kitchen BLK C","Kitchen BLK D"].map(location=><option key={location} value={location}>{location}</option>)}</select></td><td><button className="button secondary-button" type="button" disabled={lines.length===1} onClick={()=>setLines(old=>old.filter((_,n)=>n!==i))} aria-label={`Remove row ${i+1}`} title="Remove row">−</button></td></tr>;
 })}</tbody></table></div>
 <div className="section-head" style={{marginTop:14}}><button className="button secondary-button" type="button" disabled={lines.length>=100} onClick={()=>setLines(old=>[...old,blank()])}>＋ Add Row</button><button className="button" type="submit" disabled={lines.some(l=>!l.itemId)}>{busy?'Saving…':editing?'Save Changes':'Save PO'}</button></div>
 </fieldset></form>
 {editing&&!saved&&<button className="button secondary-button" type="button" disabled={busy} onClick={reset}>Cancel Edit</button>}{message&&<p role="status">{message}</p>}{saved&&<div className="section-head"><a className="button" href={`/api/purchase-orders/${saved.id}/pdf?view=1`} target="_blank" rel="noopener noreferrer">Review PO</a><button className="button secondary-button" onClick={reset}>New Purchase Order</button></div>}
 </section>;
}

function ItemBalance({ items, id, unit }: { items: Parameters<typeof itemBalance>[0]; id: string; unit: string | null }) {
  const balance = useMemo(() => itemBalance(items, id), [items, id]);
  return <small className="po-balance">{balanceLabel(balance, unit)}</small>;
}

type HistoryProps = {
  source: RowSource<PurchaseOrder>; updates: PurchaseOrder[]; initialSearch: string; orderId?: string;
  delivery: DeliveryInfo | Promise<DeliveryInfo>; busy: boolean; canCreate: boolean; canApprove: boolean; viewerId: string;
  approve: (order: PurchaseOrder) => void; edit: (order: PurchaseOrder) => void; receive: (order: PurchaseOrder) => void;
};

function DeliveryStatus({ source, order }: { source: HistoryProps['delivery']; order: PurchaseOrder }) {
  const delivery = 'byRevision' in source ? source : use(source);
  const row = delivery.byRevision[`${order.id}:${order.revision}`];
  return <>
    <small className="po-item-code">Delivery: {row?.status?.replaceAll('_', ' ') || (delivery.failed ? 'Status unavailable' : 'Not queued (historical PO)')}</small>
    {row?.error && <small className="error" role="alert">{row.error}</small>}
    {row?.sent_at && <small className="po-item-code">Sent: {new Date(row.sent_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })} MYT</small>}
  </>;
}

function History({ source, updates, orderId, initialSearch, delivery, busy, canCreate, viewerId, canApprove, approve, edit, receive }: HistoryProps) {
  const { rows, failed } = useRows(source);
  const [search, setSearch] = useState(() => rows.find(order => order.id === orderId)?.po_no || initialSearch);
  const records = useMemo(() => {
    if (!updates.length) return rows;
    const updatedIds = new Set(updates.map(order => order.id));
    return [...updates, ...rows.filter(order => !updatedIds.has(order.id))];
  }, [rows, updates]);
  const matching = useMemo(() => recentPurchaseOrders(records, search), [records, search]);
  if (failed) return <p className="error">Purchase Order storage is unavailable. Please try again shortly.</p>;
  return <section className="panel">
    <div className="section-head">
      <div><h2>Saved Purchase Orders</h2>
        <p className="subtle">{search.trim() ? 'Latest 3 matching orders by PO date. Clear search to see all records.' : 'Review the PDF before approval. Changes after approval require approval again.'}</p>
      </div>
      <input type="search" aria-label="Search purchase orders" placeholder="PO number, item code or name…" value={search} onChange={event => setSearch(event.target.value)} />
    </div>
    <div className="table-wrap">
      <table className="table po-table po-history-table">
        <thead><tr><th>PO No.</th><th>Date</th><th>Requested by</th><th>Items</th><th>Approval</th><th>Actions</th></tr></thead>
        <tbody>{matching.map(order => {
          const receipts = receivingLines(order);
          const designatedApprover = itemStore(order.items[0]?.code || '') === 'building'
            ? 'eeab5f04-30c3-42bd-a095-58e56c814358' : '1767d3e4-c907-45fe-8ed0-e433c0d0dca7';
          return <tr key={order.id}>
            <td><strong>{order.po_no}</strong></td><td>{order.order_date}</td><td>{order.requested_by}</td>
            <td>{order.items.map((item, index) => <div className="po-history-item" key={`${item.itemId}-${index}`}>
              <span>{item.description} × {item.quantity}</span><small>{item.code}</small>
            </div>)}</td>
            <td>{order.approved_at ? <>
              <strong>Approved · {order.approved_by}</strong>
              <small className="po-item-code">{new Date(order.approved_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })} MYT</small>
              <Suspense fallback={<small className="po-item-code">Delivery: Loading…</small>}><DeliveryStatus order={order} source={delivery} /></Suspense>
            </> : <>
              <span>Pending {order.items.some(item => /^(OFF|CLN)-/.test(item.code)) ? 'Mary' : 'James'} approval</span>
              {canApprove && viewerId === designatedApprover && <button className="button" disabled={busy} onClick={() => approve(order)}><CheckCircle aria-hidden="true" />Approve</button>}
            </>}</td>
            <td>
              <div className="po-record-actions">
                {canCreate && <button className="button secondary-button" type="button" disabled={busy} onClick={() => edit(order)}><Pencil aria-hidden="true" />Edit</button>}
                {canCreate && <button className="button secondary-button" type="button" disabled={busy} onClick={() => receive(order)}><PackageCheck aria-hidden="true" />Receive Goods</button>}
                <a className="button secondary-button" href={`/api/purchase-orders/${order.id}/pdf?view=1`} target="_blank" rel="noopener noreferrer"><Eye aria-hidden="true" />Review PO</a>
              </div>
              <small className="po-item-code">Revision {order.revision || 1} · {receipts.every(line => line.remaining === 0) ? 'Fully Received' : receipts.some(line => line.received > 0) ? 'Partially Received' : 'Awaiting Delivery'}</small>
            </td>
          </tr>;
        })}</tbody>
      </table>
      {!matching.length && <p>{search.trim() ? 'No matching purchase orders.' : 'No purchase orders saved yet.'}</p>}
    </div>
  </section>;
}
