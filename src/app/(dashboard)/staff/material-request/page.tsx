import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function StaffMaterialRequestPage({ searchParams }: { searchParams: Promise<{ job?: string; error?: string; success?: string }> }) {
  const profile = await requireRole(["maintenance_staff"]);
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data: jobs }, { data: items }, { data: requests }] = await Promise.all([
    supabase.from("maintenance_jobs").select("id,job_no,room_no,status,block:blocks!block_id(code)").in("status", ["in_progress", "pending_material"]).order("assigned_at", { ascending: false }),
    supabase.from("inventory_items").select("id,item_code,description,balance_qty,unit").eq("is_active", true).order("description"),
    supabase.from("material_requests").select("id,request_no,status,note,created_at,job:maintenance_jobs!job_id(job_no,room_no)").order("created_at", { ascending: false }).limit(20),
  ]);

  return <AppShell profile={profile} title="Material Request">
    <div className="section-head"><div><p className="eyebrow">Phase 4</p><h2>Request Materials</h2><p className="subtle">Select a current job and the material required.</p></div></div>
    {query.error && <p className="error">{query.error}</p>}{query.success && <p className="success">Material request submitted successfully.</p>}
    <section className="panel">
      <form action="/staff/material-request/submit" method="post" className="form-grid">
        <label className="field-wide"><span>Job</span><select name="jobId" defaultValue={query.job || ""} required><option value="">Select job</option>{(jobs || []).map((job: any) => <option key={job.id} value={job.id}>{job.job_no} · Block {job.block?.code} · {job.room_no}</option>)}</select></label>
        <label className="field-wide"><span>Material</span><select name="itemId" required><option value="">Select material</option>{(items || []).map((item: any) => <option key={item.id} value={item.id}>{item.item_code} · {item.description} · Balance {item.balance_qty} {item.unit || ""}</option>)}</select></label>
        <label><span>Quantity</span><input name="qty" type="number" min="0.01" step="0.01" required/></label>
        <label className="field-wide"><span>Note</span><textarea name="note" rows={3} placeholder="Why this material is needed"/></label>
        <div className="field-wide actions"><button className="button" type="submit">Submit Request</button></div>
      </form>
    </section>
    <div className="section-head"><h2>My Recent Requests</h2></div>
    <section className="panel list-panel">{(requests || []).length === 0 ? <p className="subtle">No material requests yet.</p> : (requests || []).map((request: any) => <div className="list-row" key={request.id}><div><strong>{request.request_no}</strong><p>{request.job?.job_no} · {request.job?.room_no}</p>{request.note && <small>{request.note}</small>}</div><span className="badge">{request.status}</span></div>)}</section>
    <p><Link className="text-link" href="/staff/tasks?status=pending_material">View Pending Material jobs</Link></p>
  </AppShell>;
}
