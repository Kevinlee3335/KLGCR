import Link from 'next/link';
import {documentReviewers,pendingDocumentReviews} from '@/lib/document-review';
export async function DocumentReviewQueue({userId}:{userId:string}){
 let docs;
 try{docs=await pendingDocumentReviews(userId);}catch{return <section className="panel"><p role="alert">Unable to load documents awaiting your review. Please refresh.</p></section>}
 if(!docs.length)return null;
 const james=userId===documentReviewers[2].id;
 return <section className="panel" style={{marginBottom:20}}><div className="section-head"><div><p className="eyebrow">DOCUMENT REVIEW</p><h2>{james?'Documents requiring your approval':'Requires your verification'} <span className="stock-state">{docs.length}</span></h2></div></div><div className="table-wrap"><table className="table"><thead><tr><th>Document</th><th>Month</th><th>Amount</th><th>Action</th></tr></thead><tbody>{docs.map(d=><tr key={d.type+d.id}><td>{d.title}</td><td>{d.period}</td><td>{d.amount?.toLocaleString('en-MY',{style:'currency',currency:'MYR'})}</td><td><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><a className="button secondary" href={'/api/document-review/'+d.type+'/'+d.id+'/preview'} target="_blank" rel="noopener noreferrer">{d.type==='billing'?'Preview Invoice':'Preview Report'}</a><Link className="button secondary" href={d.href}>Review &amp; {james?'approve':'verify'}</Link></div></td></tr>)}</tbody></table></div></section>;
}