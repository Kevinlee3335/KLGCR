import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { malaysiaDate, monitoringDueLabel } from "@/lib/monitoring-follow-up";

type MonitoringJob = {
  id: string; job_no: string; room_no: string; description: string;
  monitoring_note: string | null; monitoring_review_at: string | null;
  block: { code: string } | null; assignee: { full_name: string } | null;
};

export async function MonitoringFollowUp() {
  const db = await createClient();
  const today = malaysiaDate();
  // Include the whole local calendar day, even when the review time is later today.
  const tomorrow = new Date(`${today}T00:00:00+08:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const { data, error } = await db.from("maintenance_jobs")
    .select("id,job_no,room_no,description,monitoring_note,monitoring_review_at,block:blocks!block_id(code),assignee:profiles!assigned_to(full_name)")
    .eq("status", "under_monitoring")
    .or(`monitoring_review_at.lt.${tomorrow.toISOString()},monitoring_review_at.is.null`)
    .order("monitoring_review_at", { ascending: true, nullsFirst: true });
  const jobs = (data ?? []) as unknown as MonitoringJob[];
  const dueToday = jobs.filter(job => job.monitoring_review_at && malaysiaDate(job.monitoring_review_at) === today).length;
  const overdue = jobs.filter(job => job.monitoring_review_at && malaysiaDate(job.monitoring_review_at) < today).length;
  return <section className="panel list-panel" style={{ marginBottom: 20 }} aria-labelledby="monitoring-follow-up-title">
    <h2 id="monitoring-follow-up-title">Monitoring Follow-up</h2>
    {error ? <p role="alert" className="error">Unable to load monitoring follow-ups. Please refresh.</p> : <>
      <p className="subtle">Today: {dueToday} · Overdue: {overdue} · Review date required: {jobs.length - dueToday - overdue}</p>
      {!jobs.length && <p>No monitoring follow-ups due.</p>}
      {jobs.map(job => <article className="list-row" key={job.id}>
        <div><strong>Block {job.block?.code} · {job.room_no}</strong><p>{job.description}</p>
          {job.monitoring_note && <p>Monitoring: {job.monitoring_note}</p>}
          <small className="subtle">{job.job_no} · Maintenance: {job.assignee?.full_name || "—"}</small>
          <p className={job.monitoring_review_at && malaysiaDate(job.monitoring_review_at) < today ? "error" : "subtle"}>
            {job.monitoring_review_at ? malaysiaDate(job.monitoring_review_at) + " · " : ""}{monitoringDueLabel(job.monitoring_review_at, today)}
          </p>
        </div><Link className="button" href={`/admin/jobs/${job.id}#monitoring-follow-up`}>View / Follow up</Link>
      </article>)}
    </>}
  </section>;
}
