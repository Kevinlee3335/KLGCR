import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import styles from "./monitoring-follow-up.module.css";

type ExpiryFollowUp = {
  cycle_id: string;
  record_id: string;
  title: string;
  record_type: "certificate_license" | "servicing" | "agreement";
  location: string | null;
  due_date: string;
  days_remaining: number;
  stage: "month_before" | "fifteen_days" | "daily";
};

const typeLabels = { certificate_license: "Cert & License", servicing: "Servicing", agreement: "Agreement" };
const dateFormat = new Intl.DateTimeFormat("en-MY", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

function expiryLabel({ stage, days_remaining: days }: ExpiryFollowUp) {
  if (stage === "month_before") return "One month before";
  if (stage === "fifteen_days") return "15 days before";
  if (days < 0) return `Overdue ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

export async function ComplianceExpiryFollowUp() {
  const db = await createClient();
  const { data, error } = await db.rpc("compliance_expiry_follow_ups");
  const records = (data ?? []) as ExpiryFollowUp[];
  if (error?.code === "PGRST202" || (!error && !records.length)) return null;

  const overdue = records.filter(record => record.days_remaining < 0).length;
  const dueToday = records.filter(record => record.days_remaining === 0).length;
  const upcoming = records.length - overdue - dueToday;

  return <section className={styles.panel} aria-labelledby="compliance-expiry-title">
    <header className={styles.header}>
      <div className={styles.heading}>
        <span className={styles.icon}><Clock3 size={20} aria-hidden="true"/></span>
        <h2 id="compliance-expiry-title">Cert &amp; Servicing Follow-up</h2>
      </div>
      {!error && <div className={styles.counts}>
        {overdue > 0 && <span className={styles.overdueCount}><b>{overdue}</b> Overdue</span>}
        {dueToday > 0 && <span><b>{dueToday}</b> Due today</span>}
        {upcoming > 0 && <span><b>{upcoming}</b> Upcoming</span>}
      </div>}
    </header>
    {error ? <p role="alert" className={styles.empty}>Unable to load expiry reminders. Please refresh.</p> :
      <div className={styles.scroll} role="region" aria-label="Expiry reminders" tabIndex={0}>
        <table className={`${styles.table} ${styles.mobileRows}`}>
          <thead><tr>
            <th scope="col">Record</th><th scope="col">Location</th><th scope="col">Type</th><th scope="col">Expiry</th>
            <th scope="col"><span className={styles.srOnly}>Action</span></th>
          </tr></thead>
          <tbody>{records.map(record => <tr key={record.cycle_id}>
            <td><strong className={styles.room}>{record.title}</strong></td>
            <td data-label="Location" className={record.location ? undefined : styles.emptyCell}>
              <span className={styles.staff}>{record.location || "—"}</span>
            </td>
            <td data-label="Type"><span className={styles.staff}>{typeLabels[record.record_type]}</span></td>
            <td data-label="Expiry">
              <span className={`${styles.status} ${record.days_remaining < 0 ? styles.overdue : styles.today}`}><i/>{expiryLabel(record)}</span>
              <time className={styles.date} dateTime={record.due_date}>{dateFormat.format(new Date(record.due_date))}</time>
            </td>
            <td><Link className={styles.action} href={`/admin/cert-servicing/records/${record.record_id}`}>
              Follow up <ArrowUpRight size={15} aria-hidden="true"/>
            </Link></td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}
