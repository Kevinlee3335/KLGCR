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
const cleanerNav = [["Check-out Rooms", "/staff/checkouts"]] as const;
const staffNav = [
  ["My Dashboard", "/staff"], ["My Tasks", "/staff/tasks"],
  ["Material Request", "/staff/material-request"], ["Monitoring", "/staff/monitoring"],
  ["Calendar & Appointments", "/staff/appointments"], ["Completed Jobs", "/staff/tasks?status=completed"],
] as const;

function NavIcon({ kind }: { kind: "dashboard" | "tasks" | "calendar" | "more" }) {
  const paths = { dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z", tasks: "M7 5h14v2H7V5Zm0 6h14v2H7v-2Zm0 6h14v2H7v-2ZM3 5h2v2H3V5Zm0 6h2v2H3v-2Zm0 6h2v2H3v-2Z", calendar: "M7 2h2v3H7V2Zm8 0h2v3h-2V2ZM4 4h2v2h12V4h2v2h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1V4Zm-1 6v10h18V10H3Zm3 3h4v4H6v-4Z", more: "M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d={paths[kind]}/></svg>;
}

export function AppShell({ profile, children, title }: { profile: Profile; children: React.ReactNode; title: string }) {
  const isStaff = profile.role === "maintenance_staff" || profile.role === "cleaner";
  const operationalNav = profile.role === "cleaner" ? cleanerNav : [...staffNav, ["Check-out Rooms", "/staff/checkouts"] as const];
  const date = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  const current = (item: string) => title === item || (item === "New Complaints" && title === "Complaint Detail") ? "page" : undefined;

  return <div className={`shell ${isStaff ? "staff-shell" : "admin-shell"}`}>
    <aside className="sidebar">
      <Brand/>
      {isStaff ? <nav className="nav" aria-label="Main navigation">{operationalNav.map(([item, href]) => <Link key={item} href={href}>{item}</Link>)}</nav> : <nav className="nav admin-nav" aria-label="Main navigation">{adminNav.map(([item, href, Icon]) => <Link key={item} href={href} aria-current={current(item)}><Icon size={18}/><span>{item}</span></Link>)}</nav>}
      <div className="sidebar-footer"><div className="user-avatar">{profile.full_name.split(/\s+/).map((part) => part[0]).slice(0,2).join("")}</div><div className="user-details"><strong>{profile.full_name.toUpperCase()}</strong><small>{roleLabel[profile.role]}</small></div><LogoutForm/></div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><span className="topbar-label">KLG Campus Residence</span><h1>{title}</h1></div>
        <div className="topbar-actions"><span className="topbar-date">{date}</span>{!isStaff && <Link href="/admin/notifications" className="notification-link" aria-label="Notifications"><Bell size={19}/><span>Notifications</span></Link>}<span className="badge">{profile.blocks?.map((block) => `Block ${block.code}`).join(" · ") || "All blocks"}</span></div>
      </header>
      <div className="content">{children}</div>
    </main>

    <details className="mobile-menu">
      <summary aria-label="Open navigation menu"><i/><i/><i/></summary>
      <div className="mobile-menu-backdrop" aria-hidden="true"/>
      <aside className="mobile-drawer" aria-label="Full navigation menu">
        <div className="mobile-drawer-heading"><Brand/><span>Menu</span></div>
        {isStaff ? <nav className="nav mobile-drawer-nav">{operationalNav.map(([item, href]) => <Link key={item} href={href} aria-current={current(item)}>{item}</Link>)}</nav> : <nav className="nav admin-nav mobile-drawer-nav">{adminNav.map(([item, href, Icon]) => <Link key={item} href={href} aria-current={current(item)}><Icon size={18}/><span>{item}</span></Link>)}</nav>}
        <div className="mobile-drawer-footer"><div className="user-avatar">{profile.full_name.split(/\s+/).map((part) => part[0]).slice(0,2).join("")}</div><div className="user-details"><strong>{profile.full_name.toUpperCase()}</strong><small>{roleLabel[profile.role]}</small></div><LogoutForm/></div>
      </aside>
    </details>

    <nav className="mobile-nav" aria-label="Mobile quick navigation">
      <Link href={isStaff ? "/staff" : "/admin"}><NavIcon kind="dashboard"/><span>Dashboard</span></Link>
      <Link href={isStaff ? "/staff/tasks" : "/admin/complaints"}><NavIcon kind="tasks"/><span>Tasks</span></Link>
      {isStaff ? <Link href="/staff/appointments"><NavIcon kind="calendar"/><span>Calendar</span></Link> : <Link href="/admin/daily-tasks"><NavIcon kind="calendar"/><span>Calendar</span></Link>}
      <Link href={isStaff ? "/staff/material-request" : "/admin/reports"}><NavIcon kind="more"/><span>{isStaff ? "Materials" : "Reports"}</span></Link>
    </nav>
  </div>;
}
