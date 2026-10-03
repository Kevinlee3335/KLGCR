import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function submittedAt(value: string) { return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }

export default async function CleanerReports() {
  const profile = await requireRole(["cleaner"]);
  const db = await createClient();
  const { data: reports, error } = await db.from("complaints").select("id,complaint_no,room_no,category,description,priority,status,submitted_at").eq("source", "cleaning").order("submitted_at", { ascending: false });
  return <AppShell profile={profile} title="My Reports"><div className="section-head"><div><p className="eyebrow">Cleaner reports</p><h2>My Reports</h2><p className="subtle">Only reports you submitted are shown here. Status updates are made by Admin.</p></div><Link className="button" href="/staff/complaints/new">New Complaint</Link></div>{error && <p className="error">{error.message}</p>}<div className="daily-task-list cleaner-daily-task-list">{(reports || []).map((report) => <article className="panel daily-task-card" key={report.id}><div className="record-head"><strong>{report.complaint_no}</strong><span className={`status-badge status-${report.status}`}>{report.status.replaceAll("_", " ")}</span></div><h3>{report.category}</h3><p>Location: {report.room_no}</p>{report.description && <p className="subtle">{report.description}</p>}<small>Submitted {submittedAt(report.submitted_at)}</small></article>)}</div>{!reports?.length && <section className="panel empty"><strong>No reports submitted yet.</strong><span>Use New Complaint to report a room, bathroom, common-area or external-area defect.</span></section>}</AppShell>;
}
