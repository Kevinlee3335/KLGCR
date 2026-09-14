import { Brand } from "./brand";
import { LogoutForm } from "./logout-form";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { roleLabel } from "@/lib/types";
import { Bell, Boxes, ClipboardCheck, DoorOpen, FileBarChart, Gauge, PackageOpen, Settings, ShieldAlert, Users, Wrench } from "lucide-react";

const adminNav = [
  ["Dashboard", "/admin", Gauge], ["New Complaints", "/admin/complaints", ShieldAlert],
  ["Maintenance Jobs", "/admin/jobs", Wrench], ["Daily Tasks", "/admin/daily-tasks", ClipboardCheck],
  ["Check-out Rooms", "/admin/checkouts", DoorOpen],
  ["Material Requests", "/admin/material-requests", PackageOpen], ["Inventory", "/admin/inventory", Boxes],
  ["Reports", "/admin/reports", FileBarChart], ["Notifications", "/admin/notifications", Bell],
  ["Users", "/admin/users", Users], ["Settings", "/admin/settings", Settings],
] as const;
const cleanerNav = [["My Dashboard", "/staff/cleaner-dashboard"], ["New Complaint", "/staff/report-defect"], ["Check-out Rooms", "/staff/checkouts"]] as const;
const staffNav = [["My Dashboard", "/staff"], ["My Tasks", "/staff/tasks"], ["Material Request", "/staff/material-request"], ["Monitoring", "/staff/monitoring"], ["Appointments", "/staff/appointments"], ["Completed Jobs", "/staff/tasks?status=completed"]];

function NavIcon({ kind }: { kind: "dashboard" | "tasks" | "users" | "more" }) {
  const paths = { dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z", tasks: "M7 5h14v2H7V5Zm0 6h14v2H7v-2Zm0 6h14v2H7v-2ZM3 5h2v2H3V5Zm0 6h2v2H3v-2Zm0 6h2v2H3v-2Z", users: "M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3ZM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z", more: "M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d={paths[kind]}/></svg>;
}

export function AppShell({ profile, children, title }: { profile: Profile; children: React.ReactNode; title: string }) {
  const isStaff = profile.role === "maintenance_staff" || profile.role === "cleaner";
  const isCleaner = profile.role === "cleaner";
  const operationalNav = profile.role === "cleaner" ? cleanerNav : [...staffNav, ["Check-out Rooms", "/staff/checkouts"] as const];
  const date = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  return <div className={`shell ${isStaff ? "staff-shell" : "admin-shell"}`}><aside className="sidebar"><Brand/>{isStaff ? <nav className="nav" aria-label="Main navigation">{operationalNav.map(([item, href]) => <Link key={item} href={href}>{item}</Link>)}</nav> : <nav className="nav admin-nav" aria-label="Main navigation">{adminNav.map(([item, href, Icon]) => <Link key={item} href={href} aria-current={title === item || (item === "New Complaints" && title === "Complaint Detail") ? "page" : undefined}><Icon size={18}/><span>{item}</span></Link>)}</nav>}<div className="sidebar-footer"><div className="user-avatar">{profile.full_name.split(/\s+/).map((part) => part[0]).slice(0,2).join("")}</div><div className="user-details"><strong>{profile.full_name.toUpperCase()}</strong><small>{roleLabel[profile.role]}</small></div><LogoutForm/></div></aside><main className="main"><header className="topbar"><div><span className="topbar-label">KLG Campus Residence</span><h1>{title}</h1></div><div className="topbar-actions"><span className="topbar-date">{date}</span>{!isStaff && <Link href="/admin/notifications" className="notification-link" aria-label="Notifications"><Bell size={19}/><span>Notifications</span></Link>}<span className="badge">{profile.blocks?.map((block) => `Block ${block.code}`).join(" · ") || "All blocks"}</span></div></header><div className="content">{children}</div></main><nav className="mobile-nav" aria-label="Mobile navigation">{isCleaner ? <><Link href="/staff/cleaner-dashboard"><NavIcon kind="dashboard"/><span>Dashboard</span></Link><Link href="/staff/checkouts"><NavIcon kind="tasks"/><span>My Rooms</span></Link><Link href="/staff/report-defect"><NavIcon kind="more"/><span>New</span></Link></> : <><Link href={isStaff ? "/staff" : "/admin"}><NavIcon kind="dashboard"/><span>Dashboard</span></Link><Link href={isStaff ? "/staff/tasks" : "/admin/complaints"}><NavIcon kind="tasks"/><span>Tasks</span></Link>{!isStaff ? <Link href="/admin/reports"><NavIcon kind="users"/><span>Reports</span></Link> : <Link href="/staff/material-request"><NavIcon kind="more"/><span>Materials</span></Link>}<Link href={isStaff ? "/staff/monitoring" : "/admin/daily-tasks"}><NavIcon kind="more"/><span>{isStaff ? "Monitoring" : "Daily"}</span></Link></>}</nav></div>;
}
