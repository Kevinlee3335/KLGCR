import Link from "next/link";
import {AppShell} from "@/components/app-shell";
import {SubmitButton} from "@/components/submit-button";
import {requireRole} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {malaysiaDay,membershipEnabled} from "@/lib/membership";
import {committeeMonthLabel,type CommitteeReport} from "@/lib/committee-report";
import {saveCommitteeReport} from "./actions";
export const dynamic="force-dynamic";
export default async function CommitteeReportsPage({searchParams}:{searchParams:Promise<{year?:string;page?:string;saved?:string;error?:string}>}){
 const profile=await requireRole(["admin"]);
 if(!membershipEnabled()) return <AppShell profile={profile} title="Sports Committee"><p>Membership is not enabled.</p></AppShell>;
 const search=await searchParams;
 const openMonth=malaysiaDay().slice(0,7)+"-01";
 const {data:draftData,error:draftError}=await createAdminClient().rpc("preview_membership_committee_report",{p_month:openMonth});
 const draft=draftData as CommitteeReport|null;
 const today=malaysiaDay();
 const current=new Date(today.slice(0,7)+"-01T00:00:00Z");current.setUTCMonth(current.getUTCMonth()-1);
 const previous=current.toISOString().slice(0,7);
 const year=/^\d{4}$/.test(search.year||"")&&Number(search.year)<9999?search.year:"";
 const page=Math.max(1,Math.min(1000,Number(search.page)||1));
 let query=createAdminClient().from("membership_committee_reports").select("month,generated_at,member_count,payment_count,total_amount,remuneration",{count:"exact"}).order("month",{ascending:false});
 if(year) query=query.gte("month",`${year}-01-01`).lt("month",`${Number(year)+1}-01-01`);
 const {data,error,count}=await query.range((page-1)*24,page*24-1);
 const money=(n:number)=>Number(n).toLocaleString("en-MY",{style:"currency",currency:"MYR"});
 return <AppShell profile={profile} title="Sports Committee Reports"><div className="section-head"><div><p className="eyebrow">GYM MEMBERSHIP · MONTHLY COLLECTION</p><h2>Sports Committee Reports</h2><p className="subtle">Generated automatically on the 1st at 9:00 AM Malaysia time. Each month is saved separately.</p></div><Link className="button secondary" href="/admin/members">Back to membership</Link></div>
 {search.saved&&<p role="status">Report saved. An existing month is kept unchanged.</p>}{search.error&&<p className="error" role="alert">{search.error==="month"?"Choose a completed calendar month.":"Unable to save the report. Please try again."}</p>}
 <section className="panel"><div className="section-head"><div><p className="eyebrow">CURRENT MONTH · IN PROGRESS</p><h3>{committeeMonthLabel(openMonth)}</h3><p className="subtle">Imported Excel entries and newly approved registration / renewal payments are included automatically. Print opens after the month closes, on the 1st.</p></div><Link className="button secondary" href="/admin/members">Add / approve payments</Link></div>
 {draftError?<p className="error">Unable to load the current month. Please refresh.</p>:draft&&<><p><strong>{draft.member_count} members · {money(draft.total_amount)}</strong> · Committee payable: {money(draft.remuneration)}</p><details><summary>View current entries</summary><div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Collection</th></tr></thead><tbody>{draft.entries.map(e=><tr key={e.member_id}><td>{e.full_name}</td><td>{money(e.amount)}</td></tr>)}</tbody></table></div></details><p className="subtle">Draft — continues updating until month end. No final print yet.</p></>}
 </section>
 <section className="panel"><h3>Save a monthly report</h3><p className="subtle">Includes registration and renewal payments approved during the selected month, from the 1st through the last day (Malaysia time). Pending / rejected payments and RM10 Access Card deposits are excluded.</p><form action={saveCommitteeReport} style={{display:"flex",gap:12,alignItems:"end",flexWrap:"wrap"}}><label>Collection month<input name="month" type="month" defaultValue={previous} max={previous} min="2000-01" required/></label><SubmitButton pendingText="Saving…">Generate & save</SubmitButton></form><p className="subtle">Below RM1,000: RM500 · RM1,000 and above: 40% · Maximum RM3,000. Saved reports retain their original names, totals and calculation.</p></section>
 <section className="panel"><div className="section-head"><h3>Saved monthly reports</h3><form method="get" style={{display:"flex",gap:10,alignItems:"end"}}><label>Year<input name="year" inputMode="numeric" pattern="[0-9]{4}" placeholder="All years" defaultValue={year} style={{maxWidth:140}}/></label><button className="button secondary">Filter</button></form></div>
 {error?<p className="error">Unable to load reports. Please refresh.</p>:!data?.length?<p>No saved reports for this selection. The first scheduled report will appear after the month closes, on the 1st.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Collection month</th><th>Members</th><th>Payments</th><th>Total collection</th><th>Committee payable</th><th>Saved</th><th>Report</th></tr></thead><tbody>{data.map(r=><tr key={r.month}><td>{committeeMonthLabel(r.month)}</td><td>{r.member_count}</td><td>{r.payment_count}</td><td>{money(r.total_amount)}</td><td><strong>{money(r.remuneration)}</strong></td><td>{new Date(r.generated_at).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}</td><td><Link className="button secondary" href={`/admin/members/committee-reports/${r.month.slice(0,7)}/print`} target="_blank">Open / Print</Link><a className="text-link" style={{display:"block",marginTop:8}} href={`/admin/members/committee-reports/${r.month.slice(0,7)}/print?download=1`}>Download</a></td></tr>)}</tbody></table></div>}
 <div className="actions">{page>1&&<Link className="button secondary" href={`?year=${year}&page=${page-1}`}>Previous</Link>}{page*24<(count||0)&&<Link className="button secondary" href={`?year=${year}&page=${page+1}`}>More reports</Link>}</div></section></AppShell>;
}
