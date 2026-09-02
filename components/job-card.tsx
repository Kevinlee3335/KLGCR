import Link from "next/link"
import { ChevronRight, Clock } from "lucide-react"
import { StatusBadge, PriorityBadge } from "@/components/ui/status-badge"
import type { Job } from "@/lib/sample-data"
import { cn } from "@/lib/utils"

/**
 * Reusable field-service job card. Large tap target, room number leads so
 * staff can scan jobs quickly on-site. Used on the staff dashboard, My Tasks,
 * and Monitoring lists.
 */
export function JobCard({ job, className }: { job: Job; className?: string }) {
  return (
    <Link
      href={`/staff/jobs/${job.id}`}
      className={cn(
        "block rounded-2xl border border-border bg-card p-4 shadow-sm transition-all active:scale-[0.99] active:bg-muted/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{job.block}</p>
          <p className="text-2xl font-bold leading-tight tracking-tight">{job.room}</p>
        </div>
        <StatusBadge status={job.status} size="sm" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {job.category}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground text-pretty">{job.description}</p>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <PriorityBadge priority={job.priority} size="sm" />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          {job.scheduledFor}
          <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden="true" />
        </span>
      </div>
    </Link>
  )
}
