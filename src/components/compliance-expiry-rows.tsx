"use client";

import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import controls from "./compliance-controls.module.css";
import styles from "./monitoring-follow-up.module.css";

export type ExpiryFollowUp = {
  cycle_id: string;
  record_id: string;
  title: string;
  record_type: "certificate_license" | "servicing" | "agreement";
  location: string | null;
  due_date: string;
  days_remaining: number;
  stage: "month_before" | "fifteen_days" | "daily";
};

const previewCount = 3;
const typeLabels = { certificate_license: "Cert & License", servicing: "Servicing", agreement: "Agreement" };
const dateFormat = new Intl.DateTimeFormat("en-MY", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

function expiryLabel({ stage, days_remaining: days }: ExpiryFollowUp) {
  if (stage === "month_before") return "One month before";
  if (stage === "fifteen_days") return "15 days before";
  if (days < 0) return `Overdue ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

export function ComplianceExpiryRows({ records }: { records: ExpiryFollowUp[] }) {
  const [expanded, setExpanded] = useState(false);
  const rowsId = useId();
  const visibleRecords = expanded ? records : records.slice(0, previewCount);
  const moreCount = records.length - previewCount;
  const ToggleIcon = expanded ? ChevronUp : ChevronDown;

  return <>
    <div className={styles.scroll} role="region" aria-label="Expiry reminders" tabIndex={0} id={rowsId}>
      <table className={`${styles.table} ${styles.mobileRows}`}>
        <thead><tr>
          <th scope="col">Record</th><th scope="col">Location</th><th scope="col">Type</th><th scope="col">Expiry</th>
          <th scope="col"><span className={styles.srOnly}>Action</span></th>
        </tr></thead>
        <tbody>{visibleRecords.map(record => <tr key={record.cycle_id}>
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
    </div>
    {moreCount > 0 && <footer className={`${styles.footer} ${styles.expandFooter}`}>
      <button
        type="button"
        className={`${controls.button} ${controls.secondary}`}
        aria-expanded={expanded}
        aria-controls={rowsId}
        onClick={() => setExpanded(value => !value)}
      >
        {expanded ? "Show less" : `Show ${moreCount} more`}
        <ToggleIcon className={controls.icon} aria-hidden="true" />
      </button>
    </footer>}
  </>;
}
