import Link from "next/link";

type DashboardProps = { kind: "admin" | "staff"; name: string; blocks?: string; values: number[]; hrefs?: string[] };

export function Dashboard({ kind, name, blocks, values, hrefs }: DashboardProps) {
  const labels = kind === "admin"
    ? [["New complaints", "Awaiting review"], ["Today's tasks", "Assigned or active today"], ["Completed today", "Live completion count"], ["Outstanding", "Active carry-forward work"]]
    : [["To do", "Assigned work"], ["In progress", "Active work"], ["Pending material", "Awaiting stock"], ["Completed", "All completed"]];
  return <><section className="welcome"><div><p className="eyebrow">{kind === "admin" ? "Operations overview" : `My tasks — ${blocks || "assigned blocks"}`}</p><h2>Good day, {name.split(" ")[0]}</h2><p className="subtle">{kind === "admin" ? "Monitor maintenance activity across the residence." : "Open an assigned job to begin work."}</p></div><span className="date-badge">Phase 3 · Live workflow</span></section><section className="metrics">{labels.map(([label, hint], index) => {
    const content = <><span className="subtle">{label}</span><div className="value">{values[index] || 0}</div><small>{hint}</small></>;
    return hrefs?.[index] ? <Link className="panel metric metric-link" href={hrefs[index]} key={label}>{content}</Link> : <article className="panel metric" key={label}>{content}</article>;
  })}</section></>;
}
