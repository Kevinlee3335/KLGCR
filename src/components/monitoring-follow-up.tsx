import { ArrowUpRight, Clock3, CheckCircle2 } from "lucide-react";
import styles from "./monitoring-follow-up.module.css";
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
  return <section className={styles.panel} aria-labelledby="monitoring-follow-up-title">
    <header className={styles.header}>
      <div className={styles.heading}><span className={styles.icon}><Clock3 size={20}/></span><div><span className={styles.eyebrow}>RESIDENT CARE</span><h2 id="monitoring-follow-up-title">Monitoring Follow-up</h2><p>Contact residents and confirm the repair outcome.</p></div></div>
      {!error && <div className={styles.counts}><span><b>{dueToday}</b> Due today</span><span className={overdue ? styles.overdueCount : ""}><b>{overdue}</b> Overdue</span>{jobs.length - dueToday - overdue > 0 && <span><b>{jobs.length - dueToday - overdue}</b> Date needed</span>}</div>}
    </header>
    {error ? <p role="alert" className={styles.empty}>Unable to load monitoring follow-ups. Please refresh.</p> : jobs.length ? <div className={styles.scroll}>
      <table className={styles.table}><thead><tr><th scope="col">Room / Location</th><th scope="col">Defect &amp; monitoring</th><th scope="col">Maintenance</th><th scope="col">Review</th><th scope="col"><span className={styles.srOnly}>Action</span></th></tr></thead>
      <tbody>{jobs.map(job => {
        const overdueJob = Boolean(job.monitoring_review_at && malaysiaDate(job.monitoring_review_at) < today);
        return <tr key={job.id}>
          <td><span className={styles.block}>BLOCK {job.block?.code || "—"}</span><strong className={styles.room}>{job.room_no}</strong><span className={styles.jobNo}>{job.job_no}</span></td>
          <td><p className={styles.defect}>{job.description}</p>{job.monitoring_note && <details className={styles.notes}><summary>Monitoring note</summary><p>{job.monitoring_note}</p></details>}</td>
          <td><span className={styles.staff}>{job.assignee?.full_name || "Unassigned"}</span></td>
          <td><span className={`${styles.status} ${overdueJob ? styles.overdue : job.monitoring_review_at ? styles.today : styles.missing}`}><i/>{job.monitoring_review_at ? monitoringDueLabel(job.monitoring_review_at, today).replace(" · Follow-up required", "") : "Date needed"}</span><span className={styles.date}>{job.monitoring_review_at ? new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"numeric",month:"short",year:"numeric"}).format(new Date(job.monitoring_review_at)) : "Set a review date"}</span></td>
          <td><Link className={styles.action} href={`/admin/jobs/${job.id}#monitoring-follow-up`}>Follow up <ArrowUpRight size={15}/></Link></td>
        </tr>;
      })}</tbody></table>
    </div> : <div className={styles.empty}><CheckCircle2 size={19}/><span>All caught up. No follow-ups due today.</span></div>}
    {!error && jobs.length > 0 && <footer className={styles.footer}><span>Open items stay here until followed up.</span><Link href="/admin/jobs?status=under_monitoring">All monitoring jobs <ArrowUpRight size={14}/></Link></footer>}
  </section>;
}
