/* eslint-disable @next/next/no-html-link-for-pages -- Dashboard entries open their destination directly, including before hydration. */
import type { ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardCheck,
  ClipboardList, Clock3, FileBarChart, PackageOpen, PlayCircle,
  ShieldAlert, UserX, Wrench,
} from "lucide-react";

type Complaint = { id: string; complaint_no: string; room_no: string; category: string; description: string; priority: string; status: string; submitted_at: string; block: { code: string } | null };
type Task = { id: string; job_no: string; room_no: string; description: string; status: string; scheduled_for: string | null; assigned_at: string; block: { code: string } | null; assignee: { full_name: string } | null };
type InventorySummary = { outOfStock: number; nearReorder: number };
type TenantNoShow = { id: string; job_id: string; appointment_date: string; appointment_time: string; attended_at: string | null; no_show_remarks: string | null; attendee: { full_name: string } | null; job: { id: string; job_no: string; status: string; room_no: string; block: { code: string } | null } | null };
type JobCounts = Record<"assigned" | "in_progress" | "pending_material" | "under_monitoring" | "completed", number> & { waiting_checkout?: number };

export type AdminDashboardData = {
  kpis: { tenantNotAvailable: number; newComplaints: number; todayJobs: number; inProgress: number; pendingMaterial: number; underMonitoring: number; completedToday: number; completionPhotos: number; todayAppointments?:number;pendingAppointments?:number;kivComplaints?:number };
  complaintIntake?: { date: string; kiv?: number; total: number; dispatched: number; completed: number; under_monitoring: number; pending_material: number; in_progress: number; assigned: number; unassigned: number; rejected: number; cancelled: number } | null;
  tenantNoShows: TenantNoShow[];
  jobs: JobCounts;
  complaints: Complaint[];
  tasks: Task[];
  inventory: InventorySummary;
};

type StaffDashboardProps = { kind: "staff"; name: string; blocks?: string; values: ReactNode[]; hrefs?: string[] };
type AdminDashboardProps = { kind: "admin"; name: string; data: AdminDashboardData; monitoringFollowUp?: ReactNode };

const statusLabel = (status: string) => status === "kiv" ? "KIV" : status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const malaysiaDate = (date: string, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", ...options }).format(new Date(date));

export function AdminDashboardFrame({ name, summary, tenantAlerts, monitoringFollowUp, children }: {
  name: string; summary: ReactNode; tenantAlerts: ReactNode; monitoringFollowUp?: ReactNode; children: ReactNode;
}) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hour12: false }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const quickActions = [
    ["Review Complaints", "/admin/complaints", ShieldAlert], ["Schedule Tasks", "/admin/daily-tasks", ClipboardCheck],
    ["Material Requests", "/admin/material-requests", PackageOpen], ["Inventory", "/admin/inventory", Boxes],
    ["Generate Report", "/admin/reports", FileBarChart],
  ] as const;
  return <div className="admin-dashboard">
    <section className="command-welcome">
      <div><p className="eyebrow">Operations Command Centre</p><h2>{greeting}, {name.toUpperCase()}</h2><p className="subtle">{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}</p></div>
      <div className="command-time"><Clock3 size={17}/><span>{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hour12: true }).format(now)} MYT</span></div>
    </section>
    {summary}
    {tenantAlerts}
    {monitoringFollowUp}
    <section className="quick-section"><div className="dashboard-section-title"><div><span>Quick Actions</span><small>Common operational workflows</small></div></div><div className="quick-actions">{quickActions.map(([label, href, Icon]) => <a href={href} key={label}><Icon size={18}/><span>{label}</span><ArrowRight size={15}/></a>)}</div></section>
    <div className="operations-grid">{children}</div>
  </div>;
}

export function DashboardMetrics({ values, intakeDate, intakeTotal }: {
  values: { [K in keyof AdminDashboardData["kpis"]]: ReactNode }; intakeDate: string; intakeTotal: ReactNode;
}) {
  const kpis = [
    { title: "New Complaints", value: values.newComplaints, subtitle: "Needs triage", href: "/admin/complaints?status=new", icon: ShieldAlert, tone: "blue" },
    { title: "Today's Complaints", value: intakeTotal, subtitle: "Received today · includes completed", href: `/admin/complaints?summaryFrom=${intakeDate}&summaryTo=${intakeDate}`, icon: ShieldAlert, tone: "blue" },
    { title: "KIV Complaints", value: values.kivComplaints ?? 0, subtitle: "On hold · pending follow-up", href: "/admin/complaints?status=kiv", icon: Clock3, tone: "amber" },
    { title: "Tenant Not Available", value: values.tenantNotAvailable, subtitle: "Needs rescheduling", href: "/admin/notifications#tenant-not-available", icon: UserX, tone: "danger" },
    { title: "Today's Jobs", value: values.todayJobs, subtitle: "Assigned today", href: "/admin/jobs?scope=today-active", icon: ClipboardList, tone: "gold" },
    { title: "In Progress", value: values.inProgress, subtitle: "Active now", href: "/admin/jobs?status=in_progress", icon: PlayCircle, tone: "violet" },
    { title: "Pending Material", value: values.pendingMaterial, subtitle: "Awaiting material", href: "/admin/jobs?status=pending_material", icon: PackageOpen, tone: "amber" },
    { title: "Under Monitoring", value: values.underMonitoring, subtitle: "Follow-up required", href: "/admin/jobs?status=under_monitoring", icon: Clock3, tone: "purple" },
    { title: "Completed Today", value: values.completedToday, subtitle: "Completed today", href: "/admin/jobs?scope=completed-today", icon: CheckCircle2, tone: "green" },
    { title: "Completion Photos", value: values.completionPhotos, subtitle: "27 Sep onwards", href: "/admin/jobs?scope=completion-photos", icon: CheckCircle2, tone: "green" },
    { title: "Today's Appointments", value: values.todayAppointments, subtitle: "Scheduled visits", href: "/admin/daily-tasks", icon: Clock3, tone: "gold" },
  ];
  return <section className="admin-kpis" aria-label="Operational summary">{kpis.map(({ icon: Icon, ...kpi }) => <a className={`kpi-card kpi-${kpi.tone}`} href={kpi.href} key={kpi.title}><span className="kpi-icon"><Icon size={20}/></span><div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",minWidth:0}}><span className="kpi-title" style={{display:"block"}}>{kpi.title}</span><strong style={{display:"block",fontSize:"1.8rem",lineHeight:1.1,marginTop:"5px"}}>{kpi.value}</strong><small style={{display:"block",marginTop:"5px"}}>{kpi.subtitle}</small></div><ArrowRight className="kpi-arrow" size={16}/></a>)}</section>;
}

export function TenantAlerts({ rows }: { rows: TenantNoShow[] }) {
  return rows.length > 0 && <section className="tenant-dashboard-alert" aria-label="Tenant not available alerts">
      <div className="tenant-alert-heading">
        <span className="tenant-alert-icon"><UserX size={22}/></span>
        <div><p className="eyebrow">Action required</p><h3>Tenant Not Available</h3><p>Arrange another visit for these rooms.</p></div>
        <a href="/admin/notifications#tenant-not-available">View all <ArrowRight size={15}/></a>
      </div>
      <div className="tenant-alert-items">
        {rows.slice(0,3).map((item) => item.job && <a href={`/admin/jobs/${item.job.id}`} key={item.id}>
          <span className="tenant-alert-room">Block {item.job.block?.code ?? "–"}<strong>{item.job.room_no}</strong></span>
          <span className="tenant-alert-detail"><strong>{item.job.job_no}</strong><small>{item.attendee?.full_name ? `Reported by ${item.attendee.full_name}` : "Reported by maintenance staff"}</small>{item.no_show_remarks && <small>{item.no_show_remarks}</small>}</span>
          <span className="tenant-alert-appointment"><small>Appointment</small><strong>{malaysiaDate(`${item.appointment_date}T${item.appointment_time}+08:00`, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}</strong></span>
          <ArrowRight size={16}/>
        </a>)}
      </div>
    </section>;
}

export function JobsOverview({ jobs }: { jobs: JobCounts }) {
  const jobSegments = [
    ["Completed", jobs.completed, "#3f8b69"], ["In Progress", jobs.in_progress, "#6d58a8"],
    ["Pending Material", jobs.pending_material, "#d49a31"], ["Under Monitoring", jobs.under_monitoring, "#9672bd"],
    ["Assigned", jobs.assigned, "#4b77a8"],
    ["Waiting for Check-out", jobs.waiting_checkout ?? 0, "#a77b28"],
  ] as const;
  const totalJobs = jobSegments.reduce((sum, [, count]) => sum + count, 0);
  let accumulated = 0;
  const gradient = totalJobs ? jobSegments.map(([, count, color]) => { const start = accumulated / totalJobs * 100; accumulated += count; return `${color} ${start}% ${accumulated / totalJobs * 100}%`; }).join(",") : "#ebe8df 0 100%";

  return <section className="dashboard-card jobs-overview"><div className="dashboard-section-title"><div><span>Jobs Overview</span><small>Current maintenance workflow</small></div><Wrench size={19}/></div><div className="jobs-chart-wrap"><div className="donut" style={{ background: `conic-gradient(${gradient})` }}><div><strong>{totalJobs}</strong><span>Total Jobs</span></div></div><div className="chart-legend">{jobSegments.map(([label, count, color]) => <div key={label}><i style={{background: color}}/><span>{label}</span><strong>{count}</strong></div>)}</div></div></section>;
}

export function RecentComplaints({ rows }: { rows: Complaint[] }) {
  return <section className="dashboard-card recent-complaints"><div className="dashboard-section-title"><div><span>Recent Complaints</span><small>Latest residence submissions</small></div><a href="/admin/complaints">View all <ArrowRight size={14}/></a></div><div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Complaint No.</th><th>Block / Room</th><th>Category / Description</th><th>Priority</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><strong>{item.complaint_no}</strong></td><td>Block {item.block?.code ?? "–"} / {item.room_no}</td><td><strong>{item.category}</strong><small>{item.description}</small></td><td><span className={`priority-badge priority-${item.priority}`}>{statusLabel(item.priority)}</span></td><td><span className={`status-badge status-${item.status}`}>{statusLabel(item.status)}</span></td><td>{malaysiaDate(item.submitted_at, { day: "2-digit", month: "short" })}<small>{malaysiaDate(item.submitted_at, { hour: "numeric", minute: "2-digit", hour12: true })}</small></td></tr>)}</tbody></table>{!rows.length && <p className="dashboard-empty">No complaints have been submitted.</p>}</div></section>;
}

export function TodayTasks({ rows }: { rows: Task[] }) {
  return <section className="dashboard-card todays-tasks"><div className="dashboard-section-title"><div><span>Today&apos;s Tasks</span><small>Scheduled maintenance work</small></div><a href="/admin/daily-tasks">View all <ArrowRight size={14}/></a></div><div className="task-list">{rows.map((task) => <a href={`/admin/jobs?search=${encodeURIComponent(task.job_no)}`} key={task.id}><span className="task-time">{malaysiaDate(task.assigned_at, { hour: "2-digit", minute: "2-digit", hour12: true })}</span><span className="task-room">Block {task.block?.code ?? "–"}<strong>{task.room_no}</strong></span><span className="task-detail"><strong>{task.job_no}</strong><small>{task.description}</small>{task.assignee?.full_name && <small>{task.assignee.full_name}</small>}</span><span className={`status-badge status-${task.status}`}>{statusLabel(task.status)}</span></a>)}{!rows.length && <p className="dashboard-empty">No maintenance jobs are scheduled today.</p>}</div></section>;
}

export function InventoryAlerts({ inventory }: { inventory: InventorySummary }) {
  return <section className="dashboard-card inventory-alerts"><div className="dashboard-section-title"><div><span>Inventory Alerts</span><small>Stock requiring attention</small></div><a href="/admin/inventory">View all <ArrowRight size={14}/></a></div><div className="inventory-stats"><div><span className="alert-icon danger"><AlertTriangle size={21}/></span><span><strong>{inventory.outOfStock}</strong><small>Out of Stock</small></span></div><div><span className="alert-icon warning"><PackageOpen size={21}/></span><span><strong>{inventory.nearReorder}</strong><small>Near Reorder</small></span></div></div></section>;
}

function AdminDashboard({ name, data, monitoringFollowUp }: Omit<AdminDashboardProps, "kind">) {
  return <AdminDashboardFrame name={name} monitoringFollowUp={monitoringFollowUp}
    summary={<DashboardMetrics values={data.kpis} intakeDate={data.complaintIntake?.date ?? ""} intakeTotal={data.complaintIntake?.total ?? "—"}/>}
    tenantAlerts={<TenantAlerts rows={data.tenantNoShows}/>}>
    <JobsOverview jobs={data.jobs}/><RecentComplaints rows={data.complaints}/>
    <TodayTasks rows={data.tasks}/><InventoryAlerts inventory={data.inventory}/>
  </AdminDashboardFrame>;
}

export function Dashboard(props: AdminDashboardProps | StaffDashboardProps) {
  if (props.kind === "admin") return <AdminDashboard name={props.name} data={props.data} monitoringFollowUp={props.monitoringFollowUp}/>;
  const labels = [["To do", "Team maintenance reports"], ["In progress", "Team maintenance reports"], ["Pending material", "Team maintenance reports"], ["Completed", "All completed reports"]];
  return <><section className="welcome"><div><p className="eyebrow">Maintenance Reports — {props.blocks || "All sites"}</p><h2>Good day, {props.name.split(" ")[0]}</h2><p className="subtle">All maintenance staff can view every report. Only the assigned staff member can update a job.</p></div><span className="date-badge">Live workflow</span></section><section className="metrics">{labels.map(([label, hint], index) => { const content = <><span className="subtle">{label}</span><div className="value">{props.values[index] || 0}</div><small>{hint}</small></>; return props.hrefs?.[index] ? <a className="panel metric metric-link" href={props.hrefs[index]} key={label}>{content}</a> : <article className="panel metric" key={label}>{content}</article>; })}</section></>;
}
