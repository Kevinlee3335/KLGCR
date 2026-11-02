import Link from 'next/link';
import {pendingDocumentReviews} from '@/lib/document-review';
export async function DocumentReviewQueue({userId}:{userId:string}){
 let docs;
 try{docs=await pendingDocumentReviews(userId);}catch{return <section className="panel"><p role="alert">Unable to load documents awaiting your review. Please refresh.</p></section>}
 if(!docs.length)return null;
 const james=userId==='eeab5f04-30c3-42bd-a095-58e56c814358';
 return <section className="panel" style={{marginBottom:20}}><div className="section-head"><div><p className="eyebrow">FIKRI VERIFY → KEVIN VERIFY → JAMES APPROVE</p><h2>{james?'Documents requiring your approval':'Requires your verification'} <span className="stock-state">{docs.length}</span></h2></div></div><div className="table-wrap"><table className="table"><thead><tr><th>Document</th><th>Month</th><th>Amount</th><th>Action</th></tr></thead><tbody>{docs.map(d=><tr key={d.type+d.id}><td>{d.title}</td><td>{d.period}</td><td>{d.amount?.toLocaleString('en-MY',{style:'currency',currency:'MYR'})}</td><td><Link className="button secondary" href={d.href}>Review &amp; {james?'approve':'verify'}</Link></td></tr>)}</tbody></table></div></section>;
}