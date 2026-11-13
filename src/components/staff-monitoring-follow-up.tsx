import { ArrowUpRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/phase2-ui";
import { formatMalaysiaActivity } from "@/lib/job-activity";
import { monitoringDueLabel } from "@/lib/monitoring-follow-up";
import { type AdminFollowUp, getStaffMonitoringFollowUps } from "@/lib/staff-monitoring-follow-up";
import styles from "./monitoring-follow-up.module.css";

export function AdminFollowUpNotice({ followUp }: { followUp: AdminFollowUp }) {
  const { date, time } = formatMalaysiaActivity(followUp.created_at);
  return <div className={styles.followUpNotice}>
    <p>{followUp.note}</p>
    <time className={styles.date} dateTime={followUp.created_at}>{date} · {time} MYT</time>
  </div>;
}

export function StaffMonitoringFollowUp({ jobs, error, today }: Awaited<ReturnType<typeof getStaffMonitoringFollowUps>> & { today: string }) {
  if (!error && !jobs.length) return null;

  return <section className={styles.panel} aria-labelledby="staff-monitoring-follow-up">
    <header className={styles.header}>
      <div className={styles.heading}>
        <span className={styles.icon}><Clock3 size={20} aria-hidden="true"/></span>
        <div><h2 id="staff-monitoring-follow-up">Monitoring Follow-up</h2><p>Reviews due and jobs returned by Admin.</p></div>
      </div>
      {!error && <div className={styles.counts}><span><b>{jobs.length}</b> Awaiting action</span></div>}
    </header>
    {error && <p role="alert" className={styles.empty}>Unable to load all monitoring follow-ups. Please refresh.</p>}
    {jobs.length > 0 && <div className={styles.scroll} role="region" aria-label="Maintenance follow-ups" tabIndex={0}>
      <table className={`${styles.table} ${styles.mobileRows}`}>
        <thead><tr><th scope="col">Room / Location</th><th scope="col">Defect &amp; remarks</th><th scope="col">Status</th><th scope="col">Action needed</th><th scope="col"><span className={styles.srOnly}>Open</span></th></tr></thead>
        <tbody>{jobs.map((job) => {
          const [followUp] = job.follow_ups;
          const monitoring = job.status === "under_monitoring";
          return <tr key={job.id}>
            <td><span className={styles.block}>{job.block ? `BLOCK ${job.block.code}` : "EXTERNAL AREA"}</span><strong className={styles.room}>{job.room_no}</strong><span className={styles.jobNo}>{job.job_no}</span></td>
            <td><p className={styles.defect}>{job.description}</p>{monitoring && job.monitoring_note && <details className={styles.notes}><summary>Monitoring note</summary><p>{job.monitoring_note}</p></details>}{followUp && <AdminFollowUpNotice followUp={followUp}/>}</td>
            <td data-label="Status"><StatusBadge value={job.status}/></td>
            <td data-label="Action needed"><span className={styles.staff}>{monitoring ? monitoringDueLabel(job.monitoring_review_at, today) : "Admin returned job"}</span></td>
            <td><Link className={styles.action} href={`/staff/jobs/${job.id}?from=%2Fstaff`}>Open Job <ArrowUpRight size={15} aria-hidden="true"/></Link></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
