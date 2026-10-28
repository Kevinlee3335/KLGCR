'use client';
import {SignaturePad} from './signature-pad';
import {documentMatches,quotationDocument} from '@/lib/business-documents';
import {useEffect,useRef,useState} from 'react';
import {blankQuotation,lineAmount,quotationInput,totalAmount,type Customer,type Quotation,type QuotationInput} from '@/lib/quotations/model';
import {quotationPrintHtml} from '@/lib/quotations/print';

export function QuotationPanel(){
 const [quotes,setQuotes]=useState<Quotation[]>([]),[input,setInput]=useState(blankQuotation),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState<Quotation|null>(null);
 async function approve(q:Quotation){
  if(busy||!window.confirm(`Approve QT ${q.number} using your saved signature?`))return;
  setBusy(true);try{const r=await fetch('/api/quotations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'approve',id:q.id})}),j=await r.json();if(!r.ok)throw Error(j.error);setQuotes(v=>v.map(old=>old.id===q.id?j.quote:old));if(selected?.id===q.id)setSelected(j.quote);setMessage('Quotation approved successfully.');}catch(e){setMessage(e instanceof Error?e.message:'Unable to approve');}finally{setBusy(false)}
 }
 const requestId=useRef('');
 const customerId=useRef(''),customerQueue=useRef<Promise<void>>(Promise.resolve());
 const [customers,setCustomers]=useState<Customer[]>([]),[customerSearch,setCustomerSearch]=useState(''),[customerStatus,setCustomerStatus]=useState(''),[retryCustomer,setRetryCustomer]=useState(0);
 async function reload(){try{const r=await fetch('/api/quotations',{cache:'no-store'}),j=await r.json();if(!r.ok)throw Error(j.error);setQuotes(j.quotes);setCustomers(j.customers??[]);setLoaded(true)}catch(e){setMessage(e instanceof Error?e.message:'Unable to load quotations')}}
 useEffect(()=>{void reload()},[]);
 const customerData=JSON.stringify({customer:input.customer,address:input.address,attention:input.attention,phone:input.phone,email:input.email});
 useEffect(()=>{
  if(!loaded||selected||!input.customer.trim())return;
  let active=true;
  setCustomerStatus('Saving customer…');
  const timer=setTimeout(()=>{
   if(!customerId.current)customerId.current=crypto.randomUUID();
   const id=customerId.current;
   customerQueue.current=customerQueue.current.catch(()=>{}).then(async()=>{
    try{const r=await fetch('/api/quotations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'saveCustomer',id,customer:JSON.parse(customerData)})}),j=await r.json();if(!r.ok)throw Error(j.error);if(active){setCustomers(j.customers);setCustomerStatus('Customer saved automatically')}}catch{if(active)setCustomerStatus('Customer not saved — please retry')}
   });
  },1000);
  return ()=>{active=false;clearTimeout(timer)};
 },[customerData,loaded,selected,input.customer,retryCustomer]);
 function change<K extends keyof QuotationInput>(key:K,value:QuotationInput[K]){setInput(v=>({...v,[key]:value}));setMessage('')}
 function print(q:Quotation){const w=window.open('','_blank');if(!w){setMessage('Please allow the print preview window.');return}w.opener=null;w.document.open();w.document.write(quotationPrintHtml(q));w.document.close()}
 async function save(){
  const parsed=quotationInput.safeParse(input);if(!parsed.success){setMessage('Please fill in customer name, a valid date, and item description, quantity and unit price.');return}
  setBusy(true);setMessage('');if(!requestId.current)requestId.current=crypto.randomUUID();
  try{const r=await fetch('/api/quotations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId.current,input:parsed.data})}),j=await r.json();if(!r.ok)throw Error(j.error);setSelected(j.quote);setQuotes(v=>[j.quote,...v.filter(q=>q.id!==j.quote.id)]);setMessage('Saved successfully — QT '+j.quote.number)}catch(e){setMessage(e instanceof Error?e.message:'Unable to save quotation')}finally{setBusy(false)}
 }
 function newQuote(){if(!selected&&input.customer&&!window.confirm('Start a new quotation and discard this unsaved form?'))return;setSelected(null);setInput(blankQuotation());requestId.current='';customerId.current='';setCustomerStatus('');setMessage('')}
 const field=(label:string,key:Exclude<keyof QuotationInput,'items'>,multiline=false)=><label key={key}>{label}{multiline?<textarea rows={3} value={input[key]} disabled={busy||!!selected} onChange={e=>change(key,e.target.value)}/>:<input type={key==='date'?'date':'text'} value={input[key]} disabled={busy||!!selected} onChange={e=>change(key,e.target.value)}/>}</label>;
 return <div className="billing-module quotation-module"><style>{`.quotation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.quotation-module label{display:flex;flex-direction:column;gap:5px;font-size:13px}.quotation-module input,.quotation-module textarea{width:100%;min-width:0;padding:9px;border:1px solid #d9e1e8;border-radius:7px;font:inherit}.quotation-module textarea{resize:vertical}.quotation-items{min-width:680px;width:100%;border-collapse:collapse}.quotation-items td,.quotation-items th{padding:7px;text-align:left}.quotation-items th{font-size:12px}.quotation-items .description{width:36%}.quotation-items input{padding:7px}.quotation-module .billing-toolbar{gap:8px}.quotation-total{text-align:right;font-size:20px;font-weight:700}.quotation-module .billing-history{gap:12px}@media(max-width:640px){.quotation-grid{grid-template-columns:1fr}}`}</style>
  <div className="billing-hero"><div><span className="billing-eyebrow">KLG CAMPUS RESIDENCE</span><h2>Quotations</h2><p>Manual customer and item entry · Monthly running numbers · Letterhead printing</p></div><button className="button" disabled={busy} onClick={newQuote}>New Quotation</button></div>
  <SignaturePad/>
  {message&&<p className="billing-message" role="status">{message}</p>}
  <section className="billing-card"><h3>{selected?'QT '+selected.number:'New quotation'}</h3><p className="subtle">{selected?'Saved quotation. You can reopen and print this record any time.':'A number is assigned when saved. The original QT 2610-0001 is retained.'}</p>
   {!selected&&<div style={{padding:16,background:'#f3f6fa',borderRadius:10,marginBottom:18}}><div className="quotation-grid"><label>Search saved customers<input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Company, contact, phone or email"/></label><label>Select customer<select style={{padding:10,border:'1px solid #d9e1e8',borderRadius:7}} value="" disabled={busy||!loaded} onChange={e=>{const c=customers.find(v=>v.id===e.target.value);if(!c)return;customerId.current=c.id;setInput(v=>({...v,customer:c.customer,address:c.address,attention:c.attention,phone:c.phone,email:c.email}));setCustomerStatus('Customer details loaded')}}><option value="">Choose an existing customer…</option>{customers.filter(c=>(c.customer+' '+c.attention+' '+c.phone+' '+c.email).toLowerCase().includes(customerSearch.toLowerCase())).map(c=><option key={c.id} value={c.id}>{c.customer}{c.attention?' · '+c.attention:''}</option>)}</select></label></div><p className="subtle">Choose a saved customer, or enter a new customer below. Customer details save automatically.</p><small role="status">{customerStatus}</small>{customerStatus.includes('not saved')&&<button className="button secondary-button" onClick={()=>setRetryCustomer(v=>v+1)}>Retry customer save</button>}</div>}
   <div className="quotation-grid">{field('Quotation date','date')}{field('Customer / company name','customer')}{field('Address','address',true)}{field('Attention','attention')}{field('Mobile / fax number','phone')}{field('Email','email')}{field('Salutation','salutation')}{field('Introduction','introduction',true)}</div>
  </section>
  <section className="billing-card"><h3>Items</h3>{field('Quantity column heading','quantityHeading')}
   <div className="table-wrap"><table className="quotation-items"><thead><tr><th>No.</th><th className="description">Item</th><th>Quantity</th><th>Unit</th><th>Unit price (RM)</th><th>Amount (RM)</th><th></th></tr></thead><tbody>{input.items.map((item,index)=><tr key={index}><td>{index+1}</td>{(['description','quantity','unit','price'] as const).map(key=><td key={key}><input aria-label={`${key} for item ${index+1}`} disabled={busy||!!selected} type={key==='quantity'||key==='price'?'number':'text'} min={key==='quantity'?0.001:0} step="any" value={item[key]} onChange={e=>change('items',input.items.map((v,i)=>i===index?{...v,[key]:key==='quantity'||key==='price'?Number(e.target.value):e.target.value}:v))}/></td>)}<td>{lineAmount(item).toFixed(2)}</td><td><button type="button" className="button secondary-button" aria-label={`Remove item ${index+1}`} disabled={busy||!!selected||input.items.length===1} onClick={()=>change('items',input.items.filter((_,i)=>i!==index))}>Remove</button></td></tr>)}</tbody></table></div>
   {!selected&&<button className="button secondary-button" disabled={busy||input.items.length>=100} onClick={()=>change('items',[...input.items,{description:'',quantity:1,unit:'',price:0}])}>+ Add Row</button>}<p className="quotation-total">Total RM {totalAmount(input).toFixed(2)}</p>
   <div className="quotation-grid">{field('Note','note',true)}{field('Terms of payment','paymentTerms',true)}{field('Payment method','paymentMethod',true)}{field('Validity wording','validity',true)}</div>
   <div className="billing-toolbar" style={{marginTop:18}}>{selected?<button className="button" onClick={()=>print(selected)}>Print / Save PDF</button>:<><button className="button" disabled={busy||!loaded} onClick={()=>void save()}>{busy?'Saving…':'Save Quotation'}</button><button className="button secondary-button" onClick={()=>print({...input,id:'preview',number:'DRAFT',createdBy:'',createdAt:''})}>Preview Format</button></>}</div>
  </section>
  <section className="billing-card"><h3>Saved quotations</h3><label>Search item, quotation number / customer<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="access card / quotation number / customer"/></label>{!loaded&&<button className="button secondary-button" onClick={()=>void reload()}>Reload quotations</button>}{quotes.filter(q=>documentMatches(quotationDocument(q),query)).map(q=><div className="billing-history" key={q.id}><div><b>QT {q.number} · {q.customer}</b><small>{q.date} · RM {totalAmount(q).toFixed(2)}</small></div><div className="billing-toolbar"><button className="button secondary-button" disabled={busy} onClick={()=>{if(!selected&&input.customer&&!window.confirm('Discard unsaved form and open this quotation?'))return;setInput(q);setSelected(q);requestId.current='';setMessage('')}}>Open</button><button className="button secondary-button" onClick={()=>print(q)}>Print</button>{q.approvedAt?<span>Approved by {q.approvedBy}</span>:<button className="button" disabled={busy} onClick={()=>void approve(q)}>Approve & Sign</button>}</div></div>)}</section>
 </div>;
}
