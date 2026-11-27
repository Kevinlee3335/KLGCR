import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { CopyWhatsAppButton } from "@/components/copy-whatsapp-button";
import { requireRole } from "@/lib/auth";
import { reportText } from "@/lib/report-text";
import { createClient } from "@/lib/supabase/server";

const labels: Record<string, string> = {
  morning_tasks: "9:30 AM Morning Daily Task", midday_update: "12:00 PM Midday Update",
  daily_summary: "4:50 PM Daily Summary", progress_snapshot: "3-Hour Progress Snapshot",
  inventory_report: "Inventory Report",
};
const historySize = 10;
type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
type Filters = { date: string; block: string; staff: string; reportType: string };
type SectionProps = { db: Awaited<ReturnType<typeof createClient>>; filters: Filters };
type Item = { item_code: string; description: string; unit: string };
type Issue = {
  id: string; qty: number; inventory_items: Item | null; profiles: { full_name: string } | null;
  maintenance_jobs: { job_no: string; room_no: string; blocks: { code: string } | null } | null;
};
type Appointment = {
  id: string; appointment_date: string; appointment_time: string; status: string; staff: { full_name: string } | null;
  complaint: { complaint_no: string; room_no: string; room_access_permission: string | null; block: { code: string } | null } | null;
};

function filterParams(filters: Filters) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
}

function ReportPanel({ title, dataset, filters, children }: {
  title: string; dataset: string; filters: Filters; children: ReactNode;
}) {
  const query = filterParams(filters);
  query.set("dataset", dataset);
  return <section className="panel" style={{ marginTop: 18 }}>
    <div className="section-head"><h3>{title}</h3><div className="actions">
      <a className="button secondary button-link" href={`/admin/reports/export?${query}&format=csv`}>CSV</a>
      <a className="button secondary button-link" href={`/admin/reports/export?${query}&format=xls`}>Excel</a>
    </div></div>
    <Suspense fallback={<p className="subtle" role="status">Loading {title.toLowerCase()}…</p>}>{children}</Suspense>
  </section>;
}

async function StaffFilter({ db, staff }: { db: SectionProps["db"]; staff: string }) {
  const { data } = await db.from("profiles").select("id,full_name").eq("role", "maintenance_staff").eq("is_active", true).order("full_name");
  return <select name="staff" aria-label="Staff" defaultValue={staff}>
    <option value="">All Staff</option>
    {staff && !data?.some(person => person.id === staff) && <option value={staff}>Selected staff</option>}
    {data?.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
  </select>;
}

async function ReportHistory({ db, filters, page }: SectionProps & { page: number }) {
  const start = (page - 1) * historySize;
  let query = db.from("report_snapshots").select("id,report_type,block_group,whatsapp_text,source,created_at")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(start, start + historySize);
  if (filters.date) query = query.eq("report_date", filters.date);
  if (filters.block) query = query.eq("block_group", filters.block);
  if (filters.reportType) query = query.eq("report_type", filters.reportType);
  const { data, error } = await query;
  if (error) return <p className="error">Report history could not be loaded.</p>;
  const rows = data ?? [];
  function pageLink(next: number) {
    const params = filterParams(filters);
    if (next > 1) params.set("page", String(next));
    return params.size ? `/admin/reports?${params}` : "/admin/reports";
  }
  return <>
    {!rows.length ? <div className="empty"><div><strong>{page === 1 ? "No reports yet" : "No reports on this page"}</strong>{page === 1 && "Generate one now or wait for the automatic schedule."}</div></div> :
      <div className="mobile-cards" style={{ display: "grid" }}>{rows.slice(0, historySize).map(row =>
        <article className="panel record-card" key={row.id}>
          <div className="record-head"><strong>{labels[row.report_type] ?? row.report_type} · {row.block_group}</strong><span className="badge">{row.source}</span></div>
          <div className="record-meta"><span>{new Date(row.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</span></div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.5, marginTop: 16 }}>{reportText(row.whatsapp_text)}</pre>
          <CopyWhatsAppButton text={row.whatsapp_text} />
        </article>)}</div>}
    {(page > 1 || rows.length > historySize) && <nav aria-label="Report history pages" className="actions">
      {page > 1 && <a className="button secondary button-link" href={pageLink(page - 1)}>Newer reports</a>}
      {rows.length > historySize && <a className="button secondary button-link" href={pageLink(page + 1)}>Older reports</a>}
    </nav>}
  </>;
}

async function Appointments({ db, filters }: SectionProps) {
  let query = db.from("appointments").select("id,appointment_date,appointment_time,status,complaint:complaints!complaint_id(complaint_no,room_no,room_access_permission,block:blocks!block_id(code)),staff:profiles!assigned_staff(full_name)")
    .order("appointment_date", { ascending: false }).order("appointment_time", { ascending: false }).limit(200);
  if (filters.date) query = query.eq("appointment_date", filters.date);
  if (filters.staff) query = query.eq("assigned_staff", filters.staff);
  const { data, error } = await query.returns<Appointment[]>();
  if (error) return <p className="error">Appointments could not be loaded.</p>;
  if (!data?.length) return <p className="subtle">No appointments for the selected filters.</p>;
  return <div className="table-wrap"><table className="table"><thead><tr>
    {["Appointment Date", "Appointment Time", "Complaint", "Location", "Assigned Staff", "Room Access Permission", "Appointment Required", "Appointment Status"].map(title => <th key={title}>{title}</th>)}
  </tr></thead><tbody>{data.map(row => <tr key={row.id}>
    <td>{row.appointment_date}</td><td>{row.appointment_time.slice(0, 5)}</td><td>{row.complaint?.complaint_no}</td><td>Block {row.complaint?.block?.code} {row.complaint?.room_no}</td>
    <td>{row.staff?.full_name}</td><td>{(row.complaint?.room_access_permission || "Not set").replaceAll("_", " ")}</td>
    <td>{row.complaint?.room_access_permission === "no" ? "Yes" : "No"}</td><td>{String(row.status).replaceAll("_", " ")}</td>
  </tr>)}</tbody></table></div>;
}

async function loadIssues({ db, filters }: SectionProps) {
  let query = db.from("inventory_issue_history").select("id,qty,inventory_items(item_code,description,unit),maintenance_jobs(job_no,room_no,blocks(code)),profiles!inventory_issue_history_staff_id_fkey(full_name)")
    .order("issued_at", { ascending: false }).limit(200);
  if (filters.staff) query = query.eq("staff_id", filters.staff);
  if (filters.date) query = query.gte("issued_at", `${filters.date}T00:00:00+08:00`).lt("issued_at", `${filters.date}T23:59:59+08:00`);
  const { data, error } = await query.returns<Issue[]>();
  if (error) return null;
  return (data ?? []).filter(row => !filters.block || filters.block === "ALL" || filters.block.includes(row.maintenance_jobs?.blocks?.code ?? ""));
}

async function MaterialUsage({ issues }: { issues: ReturnType<typeof loadIssues> }) {
  const rows = await issues;
  if (!rows) return <p className="error">Material usage could not be loaded.</p>;
  if (!rows.length) return <p className="subtle">No material issues for the selected filters.</p>;
  return <div className="mobile-cards" style={{ display: "grid" }}>{rows.slice(0, 50).map(row => <div className="record-card" key={row.id}>
    <strong>{row.inventory_items?.item_code} · {row.inventory_items?.description}</strong>
    <div className="record-meta"><span>{row.qty} {row.inventory_items?.unit}</span><span>{row.maintenance_jobs?.job_no} · Block {row.maintenance_jobs?.blocks?.code} {row.maintenance_jobs?.room_no}</span><span>{row.profiles?.full_name}</span></div>
  </div>)}</div>;
}

async function Consumption({ issues }: { issues: ReturnType<typeof loadIssues> }) {
  const rows = await issues;
  if (!rows) return <p className="error">Consumption could not be loaded.</p>;
  if (!rows.length) return <p className="subtle">No consumption for the selected filters.</p>;
  const totals = new Map<string, { code: string; description: string; qty: number; unit: string }>();
  for (const row of rows) {
    const item = row.inventory_items;
    const code = item?.item_code ?? "Unknown";
    const total = totals.get(code) ?? { code, description: item?.description ?? "", qty: 0, unit: item?.unit ?? "" };
    total.qty += Number(row.qty ?? 0);
    totals.set(code, total);
  }
  return <div className="mobile-cards" style={{ display: "grid" }}>{[...totals.values()].sort((a, b) => b.qty - a.qty).map(total =>
    <div className="record-card" key={total.code}><strong>{total.code} · {total.description}</strong><div className="record-meta"><span>Total Used: {total.qty} {total.unit}</span></div></div>
  )}</div>;
}

async function Transactions({ db, filters }: SectionProps) {
  let query = db.from("inventory_adjustment_history").select("id,adjustment_type,qty,balance_before,balance_after,note,inventory_items(item_code,description,unit)")
    .order("adjusted_at", { ascending: false }).limit(50);
  if (filters.date) query = query.gte("adjusted_at", `${filters.date}T00:00:00+08:00`).lt("adjusted_at", `${filters.date}T23:59:59+08:00`);
  const { data, error } = await query.returns<{ id: string; adjustment_type: string; qty: number; balance_before: number; balance_after: number; note: string; inventory_items: Item | null }[]>();
  if (error) return <p className="error">Inventory transactions could not be loaded.</p>;
  if (!data?.length) return <p className="subtle">No inventory adjustments yet.</p>;
  return <div className="mobile-cards" style={{ display: "grid" }}>{data.map(row => <div className="record-card" key={row.id}>
    <strong>{row.inventory_items?.item_code} · {row.inventory_items?.description}</strong>
    <div className="record-meta"><span>{String(row.adjustment_type).replaceAll("_", " ")} · {row.qty} {row.inventory_items?.unit}</span><span>{row.balance_before} → {row.balance_after}</span><span>{row.note}</span></div>
  </div>)}</div>;
}

export default async function ReportsPage({ searchParams }: Props) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const [db, params = {}] = await Promise.all([createClient(), searchParams]);
  const field = (name: string) => typeof params[name] === "string" ? params[name] : "";
  const filters = { date: field("date"), block: field("block"), staff: field("staff"), reportType: field("reportType") };
  const number = Number(field("page"));
  const page = Number.isInteger(number) && number > 0 && Number.isSafeInteger(number * historySize) ? number : 1;
  const sections = { db, filters };
  const issues = loadIssues(sections);
  const types = Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>);
  return <AppShell profile={profile} title="Reports">
    {typeof params.error === "string" && <p className="error">{params.error}</p>}
    <div className="section-head"><div><h2>Reports &amp; WhatsApp Summary</h2><p className="subtle">Daily reports, material usage, consumption analysis and inventory transactions.</p></div></div>
    <div className="panel"><h3>Filters</h3><form method="get" className="inline-form">
      <input type="date" name="date" defaultValue={filters.date} />
      <select name="block" defaultValue={filters.block}><option value="">All Blocks</option><option value="AB">A &amp; B</option><option value="CD">C &amp; D</option><option value="ALL">Overall</option></select>
      <Suspense fallback={<><input type="hidden" name="staff" value={filters.staff}/><select disabled aria-label="Staff"><option>Loading staff…</option></select></>}>
        <StaffFilter db={db} staff={filters.staff} />
      </Suspense>
      <select name="reportType" defaultValue={filters.reportType}><option value="">All Report Types</option>{types}</select>
      <button className="button" type="submit">Apply</button><a className="button secondary button-link" href="/admin/reports">Reset</a>
    </form></div>
    {profile.role === "admin" && <div className="panel" style={{ marginTop: 18 }}><h3>Generate Report Now</h3><form action="/admin/reports/generate" method="post" className="inline-form">
      <select name="reportType" defaultValue="progress_snapshot">{types}</select>
      <select name="blockGroup" defaultValue="AB"><option>AB</option><option>CD</option><option>ALL</option></select>
      <button className="button" type="submit">Generate Now</button>
    </form></div>}
    <ReportPanel title="Report History" dataset="reports" filters={filters}><ReportHistory {...sections} page={page}/></ReportPanel>
    <ReportPanel title="Appointment Report" dataset="appointments" filters={filters}><Appointments {...sections}/></ReportPanel>
    <ReportPanel title="Material Usage" dataset="material_usage" filters={filters}><MaterialUsage issues={issues}/></ReportPanel>
    <ReportPanel title="Consumption Analysis" dataset="consumption" filters={filters}><Consumption issues={issues}/></ReportPanel>
    <ReportPanel title="Inventory Transactions" dataset="inventory_transactions" filters={filters}><Transactions {...sections}/></ReportPanel>
  </AppShell>;
}
