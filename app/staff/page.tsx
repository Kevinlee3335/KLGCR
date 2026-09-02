import Link from "next/link"
import { Building2, ChevronRight } from "lucide-react"
import { requireRole, getAssignedBlocks } from "@/lib/auth"
import { JobCard } from "@/components/job-card"
import { StatusDot } from "@/components/ui/status-badge"
import { SAMPLE_STAFF_JOBS, SAMPLE_KPIS } from "@/lib/sample-data"
import { Badge } from "@/components/ui/badge"

function firstName(name: string | null) {
  return (name ?? "there").split(/\s+/)[0]
}

export default async function StaffDashboardPage() {
  const { profile } = await requireRole(["maintenance_staff"])
  const blocks = await getAssignedBlocks(profile.id)

  // NOTE: Job list below uses placeholder presentation data (lib/sample-data)
  // for the design pass. Assigned blocks remain a real Supabase query.
  const openJobs = SAMPLE_STAFF_JOBS.filter((j) => j.status !== "completed")
  const stats = [
    { label: "To Do", value: SAMPLE_KPIS.todaysJobs - SAMPLE_KPIS.inProgress, status: "assigned" as const },
    { label: "Active", value: SAMPLE_KPIS.inProgress, status: "in_progress" as const },
    { label: "Waiting", value: SAMPLE_KPIS.pendingMaterial, status: "pending_material" as const },
    { label: "Done", value: SAMPLE_KPIS.completedToday, status: "completed" as const },
  ]

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <p className="text-sm text-muted-foreground">Good day,</p>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{firstName(profile.full_name)}</h1>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-1 py-3 text-center shadow-sm"
          >
            <span className="text-xl font-bold tabular-nums">{s.value}</span>
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <StatusDot status={s.status} />
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Assigned blocks */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4 text-primary" aria-hidden="true" />
          My Blocks
        </h2>
        {blocks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No blocks assigned yet. Your administrator can assign default blocks.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blocks.map((b) => (
              <Badge key={b.id} variant="gold" className="px-3 py-1 text-sm">
                {b.name ?? b.code ?? `Block ${b.id}`}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Today's jobs */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Today&apos;s Jobs</h2>
          <Link
            href="/staff/tasks"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-primary"
          >
            View all
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        <div className="space-y-3">
          {openJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </section>
    </div>
  )
}
