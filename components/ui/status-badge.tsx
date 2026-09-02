import { cn } from "@/lib/utils"

/**
 * KLG Operations — unified status & priority design system.
 *
 * One source of truth for every operational state, used everywhere: table
 * indicators, badges, KPI cards, and mobile job cards. Status colours are a
 * deliberate, centralized functional palette (the rest of the UI stays
 * charcoal / white / gold). Change a colour here and it updates system-wide.
 */

export type JobStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "pending_material"
  | "monitoring"
  | "completed"
  | "appointment"
  | "kiv"
  | "partial"

type StatusMeta = { label: string; chip: string; dot: string; solid: string }

export const STATUS_META: Record<JobStatus, StatusMeta> = {
  new: {
    label: "New",
    chip: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
    solid: "bg-red-500",
  },
  assigned: {
    label: "Assigned",
    chip: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    solid: "bg-violet-500",
  },
  in_progress: {
    label: "In Progress",
    chip: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    solid: "bg-blue-500",
  },
  pending_material: {
    label: "Pending Material",
    chip: "bg-orange-50 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
    solid: "bg-orange-500",
  },
  monitoring: {
    label: "Under Monitoring",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    solid: "bg-amber-500",
  },
  completed: {
    label: "Completed",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    solid: "bg-emerald-500",
  },
  appointment: {
    label: "Appointment",
    chip: "bg-purple-50 text-purple-700 border-purple-200",
    dot: "bg-purple-500",
    solid: "bg-purple-500",
  },
  kiv: {
    label: "KIV",
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    solid: "bg-slate-400",
  },
  partial: {
    label: "Partially Completed",
    chip: "bg-yellow-50 text-yellow-700 border-yellow-200",
    dot: "bg-yellow-500",
    solid: "bg-yellow-500",
  },
}

export function StatusBadge({
  status,
  className,
  size = "default",
}: {
  status: JobStatus
  className?: string
  size?: "sm" | "default"
}) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        meta.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

/** Small standalone colour dot for dense table rows. */
export function StatusDot({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full", STATUS_META[status].dot, className)}
      aria-hidden="true"
    />
  )
}

export type Priority = "high" | "medium" | "low"

type PriorityMeta = { label: string; chip: string; dot: string }

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  high: { label: "High Priority", chip: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  medium: { label: "Medium Priority", chip: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  low: { label: "Low Priority", chip: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
}

export function PriorityBadge({
  priority,
  className,
  showLabel = true,
  size = "default",
}: {
  priority: Priority
  className?: string
  showLabel?: boolean
  size?: "sm" | "default"
}) {
  const meta = PRIORITY_META[priority]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        meta.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {showLabel ? meta.label : priority.toUpperCase()}
    </span>
  )
}
