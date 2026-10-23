import type { ReactNode } from "react";

type Fact = { label: string; value: ReactNode; wide?: boolean };

/** Compact label/value sheet, shared by complaint and job detail pages. */
export function RecordFacts({ title, facts, children, className = "" }: { className?: string; title: string; facts: Fact[]; children?: ReactNode }) {
  return <section className={`panel record-sheet ${className}`}>
    <h3>{title}</h3>
    <dl className="record-facts">{facts.map(({ label, value, wide }) => <div key={label} className={wide ? "record-fact wide" : "record-fact"}>
      <dt>{label}</dt><dd>{value ?? "—"}</dd>
    </div>)}</dl>
    {children}
  </section>;
}
