import { Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ComplianceExpiryRows, type ExpiryFollowUp } from "./compliance-expiry-rows";
import styles from "./monitoring-follow-up.module.css";

export async function ComplianceExpiryFollowUp() {
  const db = await createClient();
  const { data, error } = await db.rpc("compliance_expiry_follow_ups");
  const records = (data ?? []) as ExpiryFollowUp[];
  if (error?.code === "PGRST202" || (!error && !records.length)) return null;

  const overdue = records.filter(record => record.days_remaining < 0).length;
  const dueToday = records.filter(record => record.days_remaining === 0).length;
  const upcoming = records.length - overdue - dueToday;

  return <section id="compliance-expiry-reminders" className={styles.panel} aria-labelledby="compliance-expiry-title">
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
    {error
      ? <p role="alert" className={styles.empty}>Unable to load expiry reminders. Please refresh.</p>
      : <ComplianceExpiryRows records={records} />}
  </section>;
}
