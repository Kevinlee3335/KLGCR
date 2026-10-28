import { createClient } from '@/lib/supabase/server';
import { recentPriceRecords } from '@/lib/supplier-mail/prices';
import { SupplierDocumentButton } from './supplier-document-button';
const money=(value:number)=>new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(value);
export async function SupplierPriceHistory({company,query}:{company:string;query:string}) {
 const db=await createClient();
 const matches=await Promise.all(['Quotation','Invoice'].map(folder=>db.rpc('search_supplier_documents',{p_company:company,p_folder:folder,p_query:query})));
 if(matches.some(r=>r.error))return <p role="alert">Unable to load price history. Please retry.</p>;
 const ids=[...new Set(matches.flatMap(r=>(r.data||[]).map((d:{id:string})=>d.id)))];
 if(!ids.length)return null;
 const {data,error}=await db.from('supplier_mail_documents').select('id,company,folder,file_name,content_text,supplier_mail_attachments(supplier_emails(received_at))').in('id',ids);
 if(error)return <p role="alert">Unable to load price history. Please retry.</p>;
 const docs=(data||[]).map(d=>({...d,receivedAt:d.supplier_mail_attachments.flatMap(a=>Array.isArray(a.supplier_emails)?a.supplier_emails:[a.supplier_emails]).filter(Boolean).map(e=>e!.received_at).sort()[0]||''}));
 const prices=recentPriceRecords(docs,query);
 return <section className="supplier-price-history" aria-label="Recent prices"><header><h2>Latest 3 price records</h2><p>Matching item prices from quotations and invoices · {query}</p></header>
  {!prices.length?<p>No item price could be reliably read. Open the related PDFs below to check.</p>:prices.map(record=><article className="supplier-price-record" key={record.id}>
   <div className="supplier-price-heading"><div><strong>{new Date(record.date+'T12:00:00+08:00').toLocaleDateString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})} · {record.company.toUpperCase()}</strong><small>{record.folder} · {record.reference}{record.dateSource==='email'?' · Email date':''}</small></div><div className="supplier-price-heading-actions"><strong className="supplier-price-value">{new Set(record.lines.map(line=>line.unitPrice)).size===1?money(record.lines[0].unitPrice)+' / unit':'Multiple item prices'}</strong><SupplierDocumentButton id={record.id}/></div></div>
   <div className="supplier-price-table-wrap"><table><thead><tr><th>Item / specification</th><th>Qty</th><th>Unit price</th><th>Item total</th></tr></thead><tbody>{record.lines.map((line,i)=><tr key={i}><td>{line.description}<small>PDF page {line.page}</small></td><td>{line.quantity} {line.unit}</td><td>{money(line.unitPrice)}</td><td>{money(line.lineTotal)}</td></tr>)}</tbody></table></div>
   <p className="supplier-price-note">{record.taxBasis}</p>
  </article>)}
  <p className="supplier-price-note">Quoted prices are not proof of purchase or payment. Compare the same specification and unit. Fewer than 3 records means fewer readable matching records were found.</p>
 </section>;
}
