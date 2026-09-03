import Link from "next/link";

type DashboardProps = { kind: "admin" | "staff"; name: string; blocks?: string; values: number[]; hrefs?: string[] };

const KL = "Asia/Kuala_Lumpur";
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: KL }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
function today() {
  return new Intl.DateTimeFormat("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: KL }).format(new Date());
}

const adminMeta: [string, string, string][] = [
  ["New complaints", "Awaiting review", "red"],
  ["Today's tasks", "Assigned or active today", "blue"],
  ["Completed today", "Live completion count", "green"],
  ["Outstanding", "Active carry-forward work", "amber"],
];
const staffMeta: [string, string, string][] = [
  ["To do", "Assigned work", "blue"],
  ["In progress", "Active work", "purple"],
  ["Pending material", "Awaiting stock", "amber"],
  ["Completed", "All completed", "green"],
];

const quickActions: [string, string][] = [
  ["Review Complaints", "/admin/complaints?status=new"],
  ["Schedule Tasks", "/admin/daily-tasks"],
  ["Material Requests", "/admin/material-requests"],
  ["Inventory", "/admin/inventory"],
  ["Generate Report", "/admin/reports"],
];

export function Dashboard({ kind, name, blocks, values, hrefs }: DashboardProps) {
  const isAdmin = kind === "admin";
  const meta = isAdmin ? adminMeta : staffMeta;
  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">{isAdmin ? "Operations Command Centre" : `My tasks — ${blocks || "assigned blocks"}`}</p>
          <h2>{greeting()}, {name.split(" ")[0]}</h2>
          <p className="subtle">{isAdmin ? "Here is today's situation across the residence." : "Open an assigned job to begin work."}</p>
        </div>
        <span className="date-badge">{today()}</span>
      </section>

      {isAdmin && (
        <section className="quick-actions" aria-label="Quick actions">
          {quickActions.map(([label, href], i) => (
            <Link key={label} href={href} className={i === 0 ? "qa-btn primary" : "qa-btn"}>
              {label}
            </Link>
          ))}
        </section>
      )}

      <section className="metrics">
        {meta.map(([label, hint, tone], index) => {
          const content = (
            <>
              <span className="cap"><span className="dot" />{label}</span>
              <div className="value">{values[index] || 0}</div>
              <small>{hint}</small>
            </>
          );
          return hrefs?.[index]
            ? <Link className={`panel metric metric-link tone-${tone}`} href={hrefs[index]} key={label}>{content}</Link>
            : <article className={`panel metric tone-${tone}`} key={label}>{content}</article>;
        })}
      </section>
    </>
  );
}
