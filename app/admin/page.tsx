import Link from "next/link"
import {
  FileWarning,
  ListChecks,
  Loader,
  PackageSearch,
  Eye,
  CheckCircle2,
  Building2,
  ArrowUpRight,
} from "lucide-react"
import { requireRole, type Block } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { PageHeader, KpiCard, SectionCard } from "@/components/dashboard-bits"
import {
  JobsOverview,
  RecentComplaints,
  TodaysTasks,
  InventoryAlerts,
  QuickActions,
} from "@/components/admin/dashboard-widgets"
import { Badge } from "@/components/ui/badge"
import {
  SAMPLE_KPIS,
  SAMPLE_JOB_BREAKDOWN,
  SAMPLE_COMPLAINTS,
  SAMPLE_TASKS,
  SAMPLE_INVENTORY_ALERTS,
} from "@/lib/sample-data"

async function getAllBlocks(): Promise<Block[]> {
  const admin = createAdminClient()
  const { data } = await admin.from("blocks").select("id, code, name, is_active").order("name", { ascending: true })
  return (data as Block[] | null) ?? []
}

function greeting(d: Date) {
  const h = d.getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline"
    >
      View all
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}

export default async function AdminDashboardPage() {
  const { profile } = await requireRole(["admin", "management_viewer"])
  const blocks = await getAllBlocks()

  const now = new Date()
  const dateLabel = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div>
      <PageHeader
        eyebrow="Operations Command Centre"
        title={`${greeting(now)}, ${profile.full_name ?? "Administrator"}`}
        description={dateLabel}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="New Complaints" value={SAMPLE_KPIS.newComplaints} icon={FileWarning} tone="urgent" hint="Needs triage" />
        <KpiCard label="Today's Jobs" value={SAMPLE_KPIS.todaysJobs} icon={ListChecks} tone="gold" />
        <KpiCard label="In Progress" value={SAMPLE_KPIS.inProgress} icon={Loader} />
        <KpiCard label="Pending Material" value={SAMPLE_KPIS.pendingMaterial} icon={PackageSearch} />
        <KpiCard label="Under Monitoring" value={SAMPLE_KPIS.monitoring} icon={Eye} />
        <KpiCard label="Completed Today" value={SAMPLE_KPIS.completedToday} icon={CheckCircle2} />
      </div>

      {/* Quick actions */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-muted-foreground">Quick Actions</h2>
        <QuickActions />
      </section>

      {/* Jobs overview + recent complaints */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <SectionCard title="Jobs Overview" className="lg:col-span-1">
          <JobsOverview data={SAMPLE_JOB_BREAKDOWN} />
        </SectionCard>
        <SectionCard
          title="Recent Complaints"
          icon={FileWarning}
          action={<ViewAll href="/admin/complaints" />}
          className="lg:col-span-2"
        >
          <RecentComplaints rows={SAMPLE_COMPLAINTS} />
        </SectionCard>
      </div>

      {/* Today's tasks + inventory alerts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <SectionCard
          title="Today's Tasks"
          icon={ListChecks}
          action={<ViewAll href="/admin/tasks" />}
          className="lg:col-span-2"
        >
          <TodaysTasks rows={SAMPLE_TASKS} />
        </SectionCard>
        <SectionCard title="Inventory Alerts" icon={PackageSearch} action={<ViewAll href="/admin/inventory" />}>
          <InventoryAlerts items={SAMPLE_INVENTORY_ALERTS} />
        </SectionCard>
      </div>

      {/* Blocks (real data) */}
      <div className="mt-6">
        <SectionCard title="All Blocks" icon={Building2}>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No blocks have been configured yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"
                >
                  <span className="text-sm font-medium">{b.name ?? b.code ?? `Block ${b.id}`}</span>
                  {b.is_active === false ? (
                    <Badge variant="muted">Inactive</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Complaint, job, task and inventory figures above are sample data illustrating the interface. They will connect
        to live operations in a later phase.
      </p>
    </div>
  )
}
