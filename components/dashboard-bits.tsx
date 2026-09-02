import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string
  description?: string
  action?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Legacy compact stat card (kept for backward compatibility). */
export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  accent?: boolean
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            accent ? "bg-primary/15 text-foreground" : "bg-secondary text-muted-foreground",
          )}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  )
}

/** Premium KPI card for the operations command centre. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  tone?: "default" | "gold" | "urgent"
  hint?: string
}) {
  const chip =
    tone === "urgent"
      ? "bg-red-50 text-red-600"
      : tone === "gold"
        ? "bg-primary/15 text-primary"
        : "bg-secondary text-muted-foreground"
  return (
    <Card className={cn("p-5 shadow-elevated transition-shadow hover:shadow-elevated-lg", tone === "urgent" && "ring-1 ring-red-200")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", chip)} aria-hidden="true">
          <Icon className="size-4.5" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && (
        <p className={cn("mt-1 text-xs font-medium", tone === "urgent" ? "text-red-600" : "text-muted-foreground")}>
          {hint}
        </p>
      )}
    </Card>
  )
}

/** Card with a titled header and optional trailing action (e.g. "View all"). */
export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string
  icon?: LucideIcon
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={cn("flex flex-col shadow-elevated", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {Icon && <Icon className="size-4 text-primary" aria-hidden="true" />}
          {title}
        </h3>
        {action}
      </div>
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </Card>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground" aria-hidden="true">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
    </div>
  )
}

export function PlaceholderPage({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState icon={Icon} title="Coming in a later phase" description={description} />
    </div>
  )
}
