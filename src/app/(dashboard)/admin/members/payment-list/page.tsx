import Link from "next/link";
import {MembershipPaymentDelete} from "@/components/membership-payment-delete";
import "../membership-compact.css";
import {Printer,ArrowLeft} from "lucide-react";
import {MembershipReceiptNumber} from "@/components/membership-receipt-number";
import {AppShell} from "@/components/app-shell";
import {MembershipPaymentListRefresh} from "@/components/membership-payment-list-refresh";
import {requireRole} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {malaysiaDay,membershipEnabled} from "@/lib/membership";
import {paymentListDate,paymentListMonthLabel,paymentListRange,validPaymentListMonth} from "@/lib/membership-payment-list";
export const dynamic="force-dynamic";
export default async function PaymentListPage({searchParams}:{searchParams:Promise<{month?:string}>}){
 const profile=await requireRole(["admin"]);
 if(!membershipEnabled())return <AppShell profile={profile} title="Monthly Payment List"><p>Membership is not enabled.</p></AppShell>;
 const search=await searchParams;
 const month=validPaymentListMonth(search.month||'')?search.month!:malaysiaDay().slice(0,7);
 const {start,end}=paymentListRange(month),db=createAdminClient();
 const all=[];
 let failed=false;
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from('membership_payment_ledger').select('id,collected_on,full_name,member_reference,member_type,source,approved_at,receipt_no').is('deleted_at',null).gte('collected_on',start).lt('collected_on',end).order('collected_on').order('approved_at',{nullsFirst:true}).order('source_row',{nullsFirst:false}).order('id').range(offset,offset+499);
  if(error){failed=true;break;}all.push(...data);if(data.length<500)break;
 }
 const {data:imports}=await db.from('membership_payment_imports').select('source_file,issues,row_count,months').order('imported_at',{ascending:false}).limit(10);
 return <AppShell profile={profile} title="Monthly Payment List"><div className="payment-list-compact"><MembershipPaymentListRefresh/><div className="section-head"><div><p className="eyebrow">GYM MEMBERSHIP · DAILY PAYMENT</p><h2>Monthly Payment List</h2><p className="subtle">New approved registrations and renewals appear automatically in the month of approval. Historical months remain available.</p></div><Link className="button secondary" href="/admin/members"><ArrowLeft size={13}/>Membership</Link></div>
 <section className="panel"><div className="payment-list-controls"><form method="get" className="payment-list-month-form"><label>Month<input type="month" name="month" defaultValue={month} required/></label><button className="button">View</button></form><Link className="button secondary" href={`/admin/members/payment-list/${month}/print`} target="_blank"><Printer size={13}/>Print / PDF</Link></div>
 <nav className="payment-month-tabs" aria-label="Imported monthly lists">{['2026-08','2026-09','2026-10'].map(m=><Link aria-current={m===month?"page":undefined} key={m} href={`?month=${m}`}>{new Date(m+"-01T00:00:00+08:00").toLocaleDateString("en-GB",{month:"short",year:"numeric",timeZone:"Asia/Kuala_Lumpur"})}</Link>)}</nav>
 <div className="payment-list-heading"><div><h3>{paymentListMonthLabel(month)}</h3><p className="subtle">{all.length} entries · Edit receipt no and click the save icon · Updates automatically</p></div><span className="badge">Live list</span></div>
 {failed?<p className="error">Unable to load this month. Please refresh.</p>:!all.length?<p>No approved payments recorded for this month.</p>:<div className="table-wrap"><table className="table payment-list-table"><colgroup><col style={{width:'4%' }}/><col style={{width:'12%' }}/><col style={{width:'22%' }}/><col style={{width:'37%' }}/><col style={{width:'15%' }}/><col style={{width:'10%' }}/></colgroup><thead><tr><th>NO</th><th>DATE</th><th>RECEIPT NO</th><th>NAME</th><th>ROOM NO</th><th>Action</th></tr></thead><tbody>{all.map((r,i)=><tr key={r.id}><td>{i+1}</td><td>{paymentListDate(r.collected_on)}</td><td><MembershipReceiptNumber id={r.id} receipt={r.receipt_no||""} name={r.full_name}/></td><td style={{whiteSpace:'normal',overflowWrap:'anywhere'}}>{r.full_name}</td><td>{r.member_reference||'Not assigned'}</td><td><MembershipPaymentDelete id={r.id} name={r.full_name}/></td></tr>)}</tbody></table></div>}
 <p className="subtle" style={{fontSize:12,marginTop:14}}>Residence: Room No · Non Residence: Member number. Imported rows retain the Excel payment date; new rows use the Admin approval date in Malaysia time.</p></section>
 {!!imports?.length&&<section className="panel"><details><summary>Historical import record</summary>{imports.map((batch,i)=><div key={i}><p>{batch.source_file} · {batch.row_count} imported entries</p>{Array.isArray(batch.issues)&&batch.issues.length>0&&<p className="subtle">{batch.issues.length} incomplete source row(s) retained for checking; excluded from the monthly lists.</p>}{Array.isArray(batch.issues)&&batch.issues.map((issue:Record<string,unknown>,j:number)=><p className="subtle" key={j}>Excel row {String(issue.source_row)} · {String(issue.receipt_no||"")} · {String(issue.reason||"")}</p>)}</div>)}</details></section>}
 </div></AppShell>;
}
