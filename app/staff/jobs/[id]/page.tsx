import Link from "next/link"
import { ChevronLeft, MapPin, Clock, Wrench, ClipboardCheck, Package, History } from "lucide-react"
import { StatusBadge, PriorityBadge } from "@/components/ui/status-badge"
import { getSampleJobDetail } from "@/lib/sample-data"
import { JobActionBar } from "@/components/staff/job-action-bar"

export default async function StaffJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // NOTE: placeholder presentation data for the design pass (lib/sample-data).
  const job = getSampleJobDetail(id)

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href="/staff/tasks"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to jobs
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <StatusBadge status={job.status} />
          <PriorityBadge priority={job.priority} size="sm" />
        </div>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {job.block} &middot; {job.ref}
        </p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">{job.room}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            {job.category}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden="true" />
            {job.scheduledFor}
          </span>
        </div>
      </div>

      {/* Complaint */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complaint</h2>
        <p className="text-sm leading-relaxed text-foreground text-pretty">{job.complaintDescription}</p>
      </section>

      {/* Action taken */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Wrench className="size-3.5" aria-hidden="true" />
          Action Taken
        </h2>
        {job.actionTaken ? (
          <p className="text-sm leading-relaxed text-foreground text-pretty">{job.actionTaken}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Not started yet.</p>
        )}
      </section>

      {/* Materials */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Package className="size-3.5" aria-hidden="true" />
          Materials
        </h2>
        <ul className="space-y-2">
          {job.materials.map((m, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="text-foreground">
                {m.name} <span className="text-muted-foreground">&times;{m.qty}</span>
              </span>
              <span
                className={
                  m.state === "requested"
                    ? "rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700"
                    : "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                }
              >
                {m.state === "requested" ? "Requested" : "Used"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* History timeline */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <History className="size-3.5" aria-hidden="true" />
          Activity
        </h2>
        <ol className="relative space-y-4 border-l border-border pl-5">
          {job.history.map((h, i) => (
            <li key={i} className="relative">
              <span
                className="absolute -left-[1.4rem] top-1 size-2.5 rounded-full border-2 border-card bg-primary"
                aria-hidden="true"
              />
              <p className="text-sm font-medium leading-tight">{h.label}</p>
              <p className="text-xs text-muted-foreground">
                {h.at} &middot; {h.by}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Status update */}
      <JobActionBar status={job.status} />

      <div className="flex items-center gap-2 rounded-xl bg-muted/40 p-3 text-[11px] text-muted-foreground">
        <ClipboardCheck className="size-3.5 shrink-0" aria-hidden="true" />
        Demo screen with placeholder data — status actions are not yet wired to the backend.
      </div>
    </div>
  )
}
