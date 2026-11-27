import { Suspense } from "react";
import { HistoryNavigation, historyPage, historyPageSize } from "../history-navigation";
import { DirectPageLink } from "@/components/direct-page-link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const submitted = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
function submittedAt(value: string) { return submitted.format(new Date(value)); }
function reportStatus(status: string) { return status === "closed" ? "completed" : status; }

export default async function CleanerReports({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const profile = await requireRole(["cleaner"]);
  const page = historyPage((await searchParams)?.page);
  return <AppShell profile={profile} title="My Reports"><div className="section-head"><div><p className="eyebrow">Cleaner reports</p><h2>My Reports</h2><p className="subtle">Only reports you submitted are shown here. Status updates when Maintenance completes the linked work.</p></div><DirectPageLink className="button" href="/staff/complaints/new">New Complaint</DirectPageLink></div><Suspense fallback={<p className="subtle" role="status">Loading reports…</p>}><ReportList page={page}/></Suspense></AppShell>;
}

async function ReportList({ page }: { page: number }) {
  const offset = (page - 1) * historyPageSize;
  const db = await createClient();
  const { data: reports, error } = await db.from("complaints").select("id,complaint_no,room_no,category,description,status,submitted_at").eq("source", "cleaning").order("submitted_at", { ascending: false }).order("id").range(offset, offset + historyPageSize);
  return <>{error && <p className="error">{error.message}</p>}<div className="daily-task-list cleaner-daily-task-list">{(reports || []).slice(0, historyPageSize).map((report) => { const status = reportStatus(report.status); return <article className="panel daily-task-card" key={report.id}><div className="record-head"><strong>{report.complaint_no}</strong><span className={`status-badge status-${status}`}>{status.replaceAll("_", " ")}</span></div><h3>{report.category}</h3><p>Location: {report.room_no}</p>{report.description && <p className="subtle">{report.description}</p>}<small>Submitted {submittedAt(report.submitted_at)}</small></article>; })}</div>{!error && !reports?.length && <section className="panel empty"><strong>No reports submitted yet.</strong><span>Use New Complaint to report a room, bathroom, common-area or external-area defect.</span></section>}{!error && <HistoryNavigation path="/staff/complaints" page={page} more={(reports?.length ?? 0) > historyPageSize}/>}</>;
}
