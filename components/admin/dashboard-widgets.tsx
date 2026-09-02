import Link from "next/link"
import {
  FileWarning,
  CalendarClock,
  PackagePlus,
  Boxes,
  BarChart3,
  ArrowUpRight,
  PackageX,
  TriangleAlert,
} from "lucide-react"
import { StatusBadge, PriorityBadge, STATUS_META, type JobStatus } from "@/components/ui/status-badge"
import type { Complaint, TaskRow, InventoryAlert } from "@/lib/sample-data"
import { cn } from "@/lib/utils"

/* Chart colours mirror the status system (see status-badge.tsx). */
const CHART_COLORS: Record<JobStatus, string> = {
  completed: "#10b981",
  in_progress: "#3b82f6",
  pending_material: "#f97316",
  monitoring: "#f59e0b",
  new: "#ef4444",
  assigned: "#8b5cf6",
  appointment: "#a855f7",
  kiv: "#94a3b8",
  partial: "#eab308",
}

export function JobsOverview({ data }: { data: { label: string; value: number; status: JobStatus }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  let acc = 0
  const segments = data.map((d) => {
    const start = total ? (acc / total) * 360 : 0
    acc += d.value
    const end = total ? (acc / total) * 360 : 0
    return `${CHART_COLORS[d.status]} ${start}deg ${end}deg`
  })
  const gradient = total ? `conic-gradient(${segments.join(", ")})` : "conic-gradient(var(--muted) 0deg 360deg)"

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative size-40 shrink-0" aria-hidden="true">
        <div className="size-40 rounded-full" style={{ background: gradient }} />
        <div className="absolute inset-0 m-auto flex size-24 flex-col items-center justify-center rounded-full bg-card shadow-sm">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-[11px] font-medium text-muted-foreground">Total Jobs</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-3 sm:flex sm:flex-col sm:gap-2.5">
        {data.map((d) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={d.label} className="flex items-center gap-2.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: CHART_COLORS[d.status] }}
                aria-hidden="true"
              />
              <span className="flex-1 text-sm text-foreground">{d.label}</span>
              <span className="text-sm font-semibold tabular-nums">{d.value}</span>
              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", className)}>
      {children}
    </th>
  )
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>
}

export function RecentComplaints({ rows }: { rows: Complaint[] }) {
  return (
    <div className="-mx-5 -mb-5 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <Th>Ref</Th>
            <Th>Block / Room</Th>
            <Th>Category</Th>
            <Th>Priority</Th>
            <Th>Status</Th>
            <Th className="text-right">Submitted</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
              <Td className="font-mono text-xs font-medium text-muted-foreground">{c.ref}</Td>
              <Td>
                <div className="font-medium text-foreground">{c.room}</div>
                <div className="text-xs text-muted-foreground">{c.block}</div>
              </Td>
              <Td>
                <div className="font-medium">{c.category}</div>
                <div className="max-w-[220px] truncate text-xs text-muted-foreground">{c.description}</div>
              </Td>
              <Td>
                <PriorityBadge priority={c.priority} size="sm" />
              </Td>
              <Td>
                <StatusBadge status={c.status} size="sm" />
              </Td>
              <Td className="text-right text-xs text-muted-foreground">{c.submittedAt}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TodaysTasks({ rows }: { rows: TaskRow[] }) {
  return (
    <div className="-mx-5 -mb-5 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <Th>Staff</Th>
            <Th>Block / Room</Th>
            <Th>Job</Th>
            <Th className="text-right">Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
              <Td className="font-medium">{t.staff}</Td>
              <Td>
                <span className="font-medium text-foreground">{t.room}</span>
                <span className="ml-1 text-xs text-muted-foreground">· {t.block}</span>
              </Td>
              <Td>{t.job}</Td>
              <Td className="text-right">
                <StatusBadge status={t.status} size="sm" />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InventoryAlerts({ items }: { items: InventoryAlert[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => {
        const out = it.level === "out"
        return (
          <li
            key={it.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                out ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600",
              )}
              aria-hidden="true"
            >
              {out ? <PackageX className="size-4.5" /> : <TriangleAlert className="size-4.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{it.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{it.sku}</p>
            </div>
            <div className="text-right">
              <p className={cn("text-sm font-semibold tabular-nums", out ? "text-red-600" : "text-orange-600")}>
                {out ? "Out of stock" : `${it.onHand} left`}
              </p>
              <p className="text-xs text-muted-foreground">Reorder at {it.reorderAt}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const QUICK_ACTIONS = [
  { label: "Review Complaints", href: "/admin/complaints", icon: FileWarning },
  { label: "Schedule Tasks", href: "/admin/tasks", icon: CalendarClock },
  { label: "Material Requests", href: "/admin/materials", icon: PackagePlus },
  { label: "Inventory", href: "/admin/inventory", icon: Boxes },
  { label: "Generate Report", href: "/admin/reports", icon: BarChart3 },
]

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {QUICK_ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-elevated"
        >
          <div className="flex items-center justify-between">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden="true">
              <a.icon className="size-5" />
            </div>
            <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
          </div>
          <span className="text-sm font-medium leading-tight text-pretty">{a.label}</span>
        </Link>
      ))}
    </div>
  )
}
