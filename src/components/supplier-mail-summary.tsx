import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";
import { recentSupplierEmails } from "@/lib/supplier-mail/queries";
import { createClient } from "@/lib/supabase/server";
import styles from "./monitoring-follow-up.module.css";

export async function SupplierMailSummary() {
  const result = await recentSupplierEmails();
  if (result.error || !result.data?.length) return null;
  const rows = result.data;
  const db = await createClient();
  const reads = await db.from("supplier_email_reads").select("message_id").in("message_id", rows.map(row => row.id));
  const seen = new Set((reads.data || []).map(row => row.message_id));

  return <section className={styles.panel} aria-labelledby="supplier-mail-title">
    <header className={styles.header}>
      <div className={styles.heading}>
        <span className={styles.icon}><Mail size={20}/></span>
        <div><span className={styles.eyebrow}>SUPPLIER CORRESPONDENCE</span><h2 id="supplier-mail-title">Supplier emails today</h2><p>Review the latest emails from suppliers.</p></div>
      </div>
      <div className={styles.counts}><span><b>{rows.length}</b> Received today</span></div>
    </header>
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead><tr><th scope="col">Supplier</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Received</th><th scope="col"><span className={styles.srOnly}>Action</span></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td><strong className={styles.staff}>{row.supplierName || row.company}</strong></td>
          <td><p className={styles.defect}>{row.subject || "(No subject)"}</p></td>
          <td>{!reads.error && !seen.has(row.id) && <span className={`${styles.status} ${styles.today}`}><i/>New</span>}</td>
          <td><span className={styles.staff}>{new Date(row.received_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</span></td>
          <td><Link className={styles.action} href={`/documents/suppliers/${row.company}/emails/${row.id}`} aria-label={`Open ${row.subject || "(No subject)"}`}>View email <ArrowUpRight size={15}/></Link></td>
        </tr>)}</tbody>
      </table>
    </div>
    <footer className={styles.footer}><span>Emails received today</span><Link href="/documents/suppliers">View company folders <ArrowUpRight size={14}/></Link></footer>
  </section>;
}
