import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardCheck,
  ClipboardList, Clock3, FileBarChart, PackageOpen, PlayCircle,
  ShieldAlert, Wrench,
} from "lucide-react";

type Complaint = { id: string; complaint_no: string; room_no: string; category: string; description: string; priority: string; status: string; submitted_at: string; block: { code: string } | null };
type Task = { id: string; job_no: string; room_no: string; description: string; status: string; scheduled_for: string | null; assigned_at: string; block: { code: string } | null; assignee: { full_name: string } | null };
type InventorySummary = { outOfStock: number; nearReorder: number };
type JobCounts = Record<"assigned" | "in_progress" | "pending_material" | "under_monitoring" | "completed", number>;

export type AdminDashboardData = {
  kpis: { newComplaints: number; todayJobs: number; inProgress: number; pendingMaterial: number; underMonitoring: number; completedToday: number };
  jobs: JobCounts;
  complaints: Complaint[];
  tasks: Task[];
  inventory: InventorySummary;
};

type StaffDashboardProps = { kind: "staff"; name: string; blocks?: string; values: number[]; hrefs?: string[] };
type AdminDashboardProps = { kind: "admin"; name: string; data: AdminDashboardData };

const statusLabel = (status: string) => status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const malaysiaDate = (date: string, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", ...options }).format(new Date(date));

function AdminDashboard({ name, data }: Omit<AdminDashboardProps, "kind">) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hour12: false }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const kpis = [
    { title: "New Complaints", value: data.kpis.newComplaints, subtitle: "Needs triage", href: "/admin/complaints?status=new", icon: ShieldAlert, tone: "blue" },
    { title: "Today's Jobs", value: data.kpis.todayJobs, subtitle: "Assigned today", href: "/admin/jobs?scope=today-active", icon: ClipboardList, tone: "gold" },
    { title: "In Progress", value: data.kpis.inProgress, subtitle: "Active now", href: "/admin/jobs?status=in_progress", icon: PlayCircle, tone: "violet" },
    { title: "Pending Material", value: data.kpis.pendingMaterial, subtitle: "Awaiting material", href: "/admin/jobs?status=pending_material", icon: PackageOpen, tone: "amber" },
    { title: "Under Monitoring", value: data.kpis.underMonitoring, subtitle: "Follow-up required", href: "/admin/jobs?status=under_monitoring", icon: Clock3, tone: "purple" },
    { title: "Completed Today", value: data.kpis.completedToday, subtitle: "Completed today", href: "/admin/jobs?scope=completed-today", icon: CheckCircle2, tone: "green" },
  ];
  const quickActions = [
    ["Review Complaints", "/admin/complaints", ShieldAlert], ["Schedule Tasks", "/admin/daily-tasks", ClipboardCheck],
    ["Material Requests", "/admin/material-requests", PackageOpen], ["Inventory", "/admin/inventory", Boxes],
    ["Generate Report", "/admin/reports", FileBarChart],
  ] as const;
  const jobSegments = [
    ["Completed", data.jobs.completed, "#3f8b69"], ["In Progress", data.jobs.in_progress, "#6d58a8"],
    ["Pending Material", data.jobs.pending_material, "#d49a31"], ["Under Monitoring", data.jobs.under_monitoring, "#9672bd"],
    ["Assigned", data.jobs.assigned, "#4b77a8"],
  ] as const;
  const totalJobs = jobSegments.reduce((sum, [, count]) => sum + count, 0);
  let accumulated = 0;
  const gradient = totalJobs ? jobSegments.map(([, count, color]) => { const start = accumulated / totalJobs * 100; accumulated += count; return `${color} ${start}% ${accumulated / totalJobs * 100}%`; }).join(",") : "#ebe8df 0 100%";

  return <div className="admin-dashboard">
    <section className="command-welcome">
      <div><p className="eyebrow">Operations Command Centre</p><h2>{greeting}, {name.toUpperCase()}</h2><p className="subtle">{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}</p></div>
      <div className="command-time"><Clock3 size={17}/><span>{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hour12: true }).format(now)} MYT</span></div>
    </section>
    <section className="admin-kpis" aria-label="Operational summary">{kpis.map(({ icon: Icon, ...kpi }) => <Link className={`kpi-card kpi-${kpi.tone}`} href={kpi.href} key={kpi.title}><span className="kpi-icon"><Icon size={20}/></span><div><span className="kpi-title">{kpi.title}</span><strong>{kpi.value}</strong><small>{kpi.subtitle}</small></div><ArrowRight className="kpi-arrow" size={16}/></Link>)}</section>
    <section className="quick-section"><div className="dashboard-section-title"><div><span>Quick Actions</span><small>Common operational workflows</small></div></div><div className="quick-actions">{quickActions.map(([label, href, Icon]) => <Link href={href} key={label}><Icon size={18}/><span>{label}</span><ArrowRight size={15}/></Link>)}</div></section>
    <div className="operations-grid">
      <section className="dashboard-card jobs-overview"><div className="dashboard-section-title"><div><span>Jobs Overview</span><small>Current maintenance workflow</small></div><Wrench size={19}/></div><div className="jobs-chart-wrap"><div className="donut" style={{ background: `conic-gradient(${gradient})` }}><div><strong>{totalJobs}</strong><span>Total Jobs</span></div></div><div className="chart-legend">{jobSegments.map(([label, count, color]) => <div key={label}><i style={{background: color}}/><span>{label}</span><strong>{count}</strong></div>)}</div></div></section>
      <section className="dashboard-card recent-complaints"><div className="dashboard-section-title"><div><span>Recent Complaints</span><small>Latest residence submissions</small></div><Link href="/admin/complaints">View all <ArrowRight size={14}/></Link></div><div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Complaint No.</th><th>Block / Room</th><th>Category / Description</th><th>Priority</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{data.complaints.map((item) => <tr key={item.id}><td><strong>{item.complaint_no}</strong></td><td>Block {item.block?.code ?? "–"} / {item.room_no}</td><td><strong>{item.category}</strong><small>{item.description}</small></td><td><span className={`priority-badge priority-${item.priority}`}>{statusLabel(item.priority)}</span></td><td><span className={`status-badge status-${item.status}`}>{statusLabel(item.status)}</span></td><td>{malaysiaDate(item.submitted_at, { day: "2-digit", month: "short" })}<small>{malaysiaDate(item.submitted_at, { hour: "numeric", minute: "2-digit", hour12: true })}</small></td></tr>)}</tbody></table>{!data.complaints.length && <p className="dashboard-empty">No complaints have been submitted.</p>}</div></section>
      <section className="dashboard-card todays-tasks"><div className="dashboard-section-title"><div><span>Today&apos;s Tasks</span><small>Scheduled maintenance work</small></div><Link href="/admin/daily-tasks">View all <ArrowRight size={14}/></Link></div><div className="task-list">{data.tasks.map((task) => <Link href={`/admin/jobs?search=${encodeURIComponent(task.job_no)}`} key={task.id}><span className="task-time">{malaysiaDate(task.assigned_at, { hour: "2-digit", minute: "2-digit", hour12: true })}</span><span className="task-room">Block {task.block?.code ?? "–"}<strong>{task.room_no}</strong></span><span className="task-detail"><strong>{task.job_no}</strong><small>{task.description}</small>{task.assignee?.full_name && <small>{task.assignee.full_name}</small>}</span><span className={`status-badge status-${task.status}`}>{statusLabel(task.status)}</span></Link>)}{!data.tasks.length && <p className="dashboard-empty">No maintenance jobs are scheduled today.</p>}</div></section>
      <section className="dashboard-card inventory-alerts"><div className="dashboard-section-title"><div><span>Inventory Alerts</span><small>Stock requiring attention</small></div><Link href="/admin/inventory">View all <ArrowRight size={14}/></Link></div><div className="inventory-stats"><div><span className="alert-icon danger"><AlertTriangle size={21}/></span><span><strong>{data.inventory.outOfStock}</strong><small>Out of Stock</small></span></div><div><span className="alert-icon warning"><PackageOpen size={21}/></span><span><strong>{data.inventory.nearReorder}</strong><small>Near Reorder</small></span></div></div></section>
    </div>
  </div>;
}

export function Dashboard(props: AdminDashboardProps | StaffDashboardProps) {
  if (props.kind === "admin") return <AdminDashboard name={props.name} data={props.data}/>;
  const labels = [["To do", "Assigned work"], ["In progress", "Active work"], ["Pending material", "Awaiting stock"], ["Completed", "All completed"]];
  return <><section className="welcome"><div><p className="eyebrow">My tasks — {props.blocks || "assigned blocks"}</p><h2>Good day, {props.name.split(" ")[0]}</h2><p className="subtle">Open an assigned job to begin work.</p></div><span className="date-badge">Live workflow</span></section><section className="metrics">{labels.map(([label, hint], index) => { const content = <><span className="subtle">{label}</span><div className="value">{props.values[index] || 0}</div><small>{hint}</small></>; return props.hrefs?.[index] ? <Link className="panel metric metric-link" href={props.hrefs[index]} key={label}>{content}</Link> : <article className="panel metric" key={label}>{content}</article>; })}</section></>;
}
