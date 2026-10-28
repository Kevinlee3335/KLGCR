import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {requireRole} from '@/lib/auth';
import {loadBusinessDocuments} from '@/lib/business-document-queries';
import {documentMatches,lineMatches,newestDocuments,type BusinessDocument,type BusinessKind} from '@/lib/business-documents';
import '@/app/(dashboard)/documents/records.css';
const money=(price:number|null)=>price===null?'Not recorded':new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(price);
function RecordRow({doc,query,kind}:{doc:BusinessDocument;query:string;kind:BusinessKind}){
 const matching=doc.items.filter(i=>lineMatches(i,query)),items=matching.length?matching:doc.items;
 return <tr><td><strong>{doc.number}</strong><small>{doc.status}</small></td><td>{doc.date}</td><td>{doc.party}</td><td>{items.map((item,index)=><div className="business-document-item" key={index}><strong>{item.description}</strong>{item.specification&&<small>{item.specification}</small>}<small>{item.quantity} {item.unit}{item.price!==null?' · '+money(item.price)+' / unit':''}</small></div>)}</td><td><a className="business-document-review" href={doc.reviewUrl} target="_blank" rel="noopener noreferrer">{kind==='purchase-orders'?'Review PO':'Review Quotation'}</a></td></tr>;
}
export async function BusinessDocumentArchive({kind,searchParams}:{kind:BusinessKind;searchParams:Promise<{q?:string;page?:string}>}){
 const profile=await requireRole(['admin','management_viewer']);
 const {q:raw='',page:rawPage='1'}=await searchParams,q=raw.trim().slice(0,200);
 const page=Math.max(1,Number.parseInt(rawPage)||1),size=30;
 let docs:BusinessDocument[]=[],error=false;
 try{docs=newestDocuments(await loadBusinessDocuments(kind));}catch{error=true;}
 const matches=docs.filter(d=>documentMatches(d,q));
 const title=kind==='purchase-orders'?'Purchase Orders':'Quotations';
 const table=(rows:BusinessDocument[])=><div className="business-document-table-wrap"><table><thead><tr><th>{kind==='purchase-orders'?'PO':'Quotation'} No.</th><th>Date</th><th>{kind==='purchase-orders'?'Requested by':'Customer'}</th><th>Items / quantities{kind==='quotations'?' / unit prices':''}</th><th>Review</th></tr></thead><tbody>{rows.map(d=><RecordRow key={d.id} doc={d} query={q} kind={kind}/>)}</tbody></table></div>;
 const url=(next:number)=>'?'+new URLSearchParams({q,page:String(next)});
 return <AppShell profile={profile} title={title}><div className="business-documents">
  <Link className="business-document-back" href="/documents">← Documents</Link>
  <header><div><h2>{title}</h2><p>Saved system records appear here automatically. Updates use the latest saved version.</p></div><Link className="business-document-review" href={kind==='purchase-orders'?'/admin/inventory/purchase-orders':'/admin/quotations'}>Manage {title}</Link></header>
  <nav><Link className={kind==='purchase-orders'?'is-active':''} href="/documents/purchase-orders">Purchase Orders</Link><Link className={kind==='quotations'?'is-active':''} href="/documents/quotations">Quotations</Link></nav>
  <form className="business-document-search"><label><span>Search item name, specification or document number</span><input name="q" defaultValue={q} placeholder="e.g. window handle" type="search" maxLength={200}/></label><button type="submit">Search</button></form>
  {error?<p role="alert">Unable to load saved records. Please retry.</p>:<>
   {q&&<section><h3>Latest 3 matching {kind==='purchase-orders'?'orders':'quotations'}</h3>{matches.length?table(matches.slice(0,3)):<p>No matching saved records found.</p>}</section>}
   {q?<details><summary>All matching records ({matches.length})</summary>{table(matches.slice((page-1)*size,page*size))}<footer><span>Page {page}</span><div>{page>1&&<Link href={url(page-1)}>← Previous</Link>}{page*size<matches.length&&<Link href={url(page+1)}>Next →</Link>}</div></footer></details>:<section><h3>Saved records <small>({matches.length})</small></h3>{matches.length?table(matches.slice((page-1)*size,page*size)):<p>No saved records found.</p>}<footer><span>Page {page}</span><div>{page>1&&<Link href={url(page-1)}>← Previous</Link>}{page*size<matches.length&&<Link href={url(page+1)}>Next →</Link>}</div></footer></section>}
   {kind==='purchase-orders'&&<p className="business-document-note">PO supplier and unit price are not stored in the current PO form. Approval status is shown; pending approval is not a confirmed purchase.</p>}
  </>}
 </div></AppShell>;
}
