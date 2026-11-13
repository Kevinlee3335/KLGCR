import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ComplianceExpiryFollowUp } from "@/components/compliance-expiry-follow-up";
import { ComplianceReviewFollowUp } from "@/components/compliance-review-follow-up";
import { Dashboard, type AdminDashboardData } from "@/components/dashboard";
import { DashboardActionFollowUp } from "@/components/dashboard-action-follow-up";
import { DocumentReviewQueue } from "@/components/document-review-queue";
import { MonitoringFollowUp } from "@/components/monitoring-follow-up";
import { PaymentMailFollowUp } from "@/components/payment-mail-follow-up";
import { PoApprovalQueue } from "@/components/po-approval-queue";
import { SupplierMailSummary } from "@/components/supplier-mail-summary";
import { UnifiInvoiceFollowUp } from "@/components/unifi-invoice-follow-up";
import { UnifiReviewFollowUp } from "@/components/unifi-review-follow-up";
import { loadAdminDashboardWorkload } from "@/lib/admin-dashboard-workload";
import { unresolvedTenantNoShows, type TenantNoShowNotification } from "@/lib/admin-notifications";
import { requireRole } from "@/lib/auth";
import { membershipEnabled } from "@/lib/membership";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type DashboardClient = Awaited<ReturnType<typeof createClient>>;

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function loadTenantNoShows(supabase: DashboardClient) {
  const { data, error } = await supabase.from("appointments")
    .select("id,job_id,appointment_date,appointment_time,attended_at,no_show_remarks,attendee:profiles!appointments_attended_by_fkey(full_name),job:maintenance_jobs!appointments_job_id_fkey(id,job_no,status,room_no,block:blocks!block_id(code))")
    .eq("status", "no_show")
    .order("attended_at", { ascending: false });
  if (error) console.error("Dashboard tenant no-shows could not be loaded", error.message);

  const noShows = (data ?? []) as unknown as TenantNoShowNotification[];
  const openJobIds = [...new Set(noShows.filter((row) => row.job && !["completed", "cancelled"].includes(row.job.status)).map((row) => row.job_id))];
  const { data: activeAppointments } = openJobIds.length
    ? await supabase.from("appointments").select("job_id").in("job_id", openJobIds).in("status", ["pending_confirmation", "confirmed"])
    : { data: [] as { job_id: string }[] };
  return unresolvedTenantNoShows(noShows, (activeAppointments ?? []).map((row) => row.job_id));
}

async function loadDashboardData(supabase: DashboardClient, today: string): Promise<AdminDashboardData> {
  const [
    { data: countRows, error: countError }, { jobs, inventory }, { data: complaints },
    { data: tasks }, { count: todayAppointments },
    { count: completionPhotos }, tenantNoShows, { data: complaintIntake, error: intakeError },
  ] = await Promise.all([
    supabase.rpc("admin_dashboard_counts"),
    loadAdminDashboardWorkload(supabase),
    supabase.from("complaints").select("id,complaint_no,room_no,category,description,priority,status,submitted_at,block:blocks!block_id(code)").order("submitted_at", { ascending: false }).limit(5),
    supabase.from("maintenance_jobs").select("id,job_no,room_no,description,status,scheduled_for,assigned_at,complaint:complaints!inner(availability_date,availability_time,room_access_permission),block:blocks!block_id(code),assignee:profiles!assigned_to(full_name)").eq("scheduled_for", today).neq("complaints.room_access_permission", "no").not("status", "in", '("completed","cancelled")').order("assigned_at", { ascending: true }).limit(5),
    supabase.from("appointments").select("*", { count: "exact", head: true }).eq("appointment_date", today).not("status", "in", '("cancelled","no_show")'),
    supabase.from("maintenance_jobs").select("*", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", "2026-09-27T00:00:00+08:00"),
    loadTenantNoShows(supabase),
    supabase.rpc("complaint_intake_summary", { p_date: today, p_group: "ALL" }),
  ]);
  if (intakeError) console.error("Complaint intake summary failed", intakeError.message);
  if (countError) console.error("admin_dashboard_counts failed", countError.message);

  const counts = countRows?.[0];

  return {
    kpis: {
      tenantNotAvailable: tenantNoShows.length,
      newComplaints: Number(counts?.new_complaints ?? 0),
      todayJobs: Number(counts?.today_tasks ?? 0),
      inProgress: jobs.in_progress,
      pendingMaterial: jobs.pending_material,
      underMonitoring: jobs.under_monitoring,
      completedToday: Number(counts?.completed_today ?? 0),
      completionPhotos: completionPhotos || 0,
      todayAppointments: todayAppointments || 0,
    },
    complaintIntake: intakeError ? null : complaintIntake,
    tenantNoShows,
    jobs,
    complaints: (complaints ?? []) as unknown as AdminDashboardData["complaints"],
    tasks: (tasks ?? []) as unknown as AdminDashboardData["tasks"],
    inventory,
  };
}

async function PurchaseOrderFollowUp({ supabase }: { supabase: DashboardClient }) {
  const { data, error, count } = await supabase.from("inventory_purchase_orders")
    .select("id,po_no,requested_by,revision", { count: "exact" })
    .is("approved_at", null).order("created_at", { ascending: true }).limit(10);

  return error
    ? <section className="panel"><p role="alert">Unable to load purchase orders awaiting approval. Please refresh.</p></section>
    : <PoApprovalQueue orders={data || []} total={count || 0}/>;
}

function loadCleanerQueue(supabase: DashboardClient) {
  return Promise.resolve(supabase.rpc("checkout_housekeeping_queue"));
}

async function CleanerAssignmentFollowUp({ queue }: { queue: ReturnType<typeof loadCleanerQueue> }) {
  const { data, error } = await queue;
  if (error) return <section className="panel" role="alert">Unable to load rooms awaiting cleaner assignment. Please refresh.</section>;

  const rooms = (data as { rooms?: { id: string; block: string; room_no: string }[] } | null)?.rooms ?? [];
  return <DashboardActionFollowUp
    title="Cleaner Assignment"
    subtitle="Rooms ready and waiting for a cleaner."
    count={rooms.length}
    items={rooms.map(room => ({ id: room.id, name: `Block ${room.block} · ${room.room_no}`, detail: "Ready to assign" }))}
    href="/staff/checkouts/assign"
    action="Assign Cleaner"
  />;
}

async function loadGymFollowUps() {
  try {
    const db = createAdminClient();
    const [registrations, renewalPayments, renewals] = await Promise.all([
      db.from("membership_payments").select("id,memberships(full_name,room_no)", { count: "exact" }).eq("status", "pending_verification").eq("kind", "registration").order("created_at").limit(50),
      db.from("membership_payments").select("id,memberships(full_name,room_no)", { count: "exact" }).eq("status", "pending_verification").eq("kind", "renewal").order("created_at").limit(50),
      db.from("membership_requests").select("id,full_name,room_no", { count: "exact" }).eq("status", "pending").eq("request_type", "renew").order("created_at").limit(50),
    ]);
    if (registrations.error || renewalPayments.error || renewals.error) return null;

    type Payment = { id: string; memberships: { full_name: string; room_no: string } | null };
    const item = (p: Payment) => ({ id: p.id, name: p.memberships?.full_name || "Member", detail: p.memberships?.room_no || "Room not provided" });
    return {
      registrations: ((registrations.data || []) as unknown as Payment[]).map(item),
      renewals: [
        ...((renewalPayments.data || []) as unknown as Payment[]).map(item),
        ...(renewals.data || []).map(p => ({ id: p.id, name: p.full_name, detail: p.room_no || "Room not provided" })),
      ],
      registrationCount: registrations.count || 0,
      renewalCount: (renewalPayments.count || 0) + (renewals.count || 0),
    };
  } catch {
    return null;
  }
}

async function GymFollowUps({ summary }: { summary: ReturnType<typeof loadGymFollowUps> }) {
  const gym = await summary;
  if (!gym) return <section className="panel" role="alert">Unable to load gym applications. Please refresh.</section>;

  return <>
    <DashboardActionFollowUp
      title="New Gym Membership"
      subtitle="New membership applications awaiting review."
      count={gym.registrationCount}
      items={gym.registrations}
      href="/admin/members#payment-verification"
      action="Review"
    />
    <DashboardActionFollowUp
      title="Gym Renewal"
      subtitle="Renewal requests awaiting review."
      count={gym.renewalCount}
      items={gym.renewals}
      href="/admin/members"
      action="Review"
    />
  </>;
}

async function DashboardContent({ name, summary, children }: { name: string; summary: Promise<AdminDashboardData>; children: ReactNode }) {
  const data = await summary;
  return <Dashboard kind="admin" name={name} data={data} monitoringFollowUp={children}/>;
}

function DashboardSummaryLoading() {
  return <div aria-busy="true" aria-live="polite">
    <div className="loading-bar"/>
    <div className="loading-grid">{[1, 2, 3, 4].map((item) => <div className="loading-card" key={item}/>)}</div>
    <span className="sr-only">Loading dashboard</span>
  </div>;
}

export default async function AdminPage() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const supabase = await createClient();
  const isAdmin = profile.role === "admin";
  const isPoApprover = isAdmin && profile.id === "eeab5f04-30c3-42bd-a095-58e56c814358";
  const isCleanerCoordinator = isAdmin && ["mary", "fikri"].includes(profile.username);
  const summary = loadDashboardData(supabase, malaysiaToday());
  const cleanerQueue = isCleanerCoordinator ? loadCleanerQueue(supabase) : null;
  const gymSummary = isAdmin && membershipEnabled() ? loadGymFollowUps() : null;

  return <AppShell profile={profile} title="Dashboard">
    {isPoApprover && <Suspense fallback={null}><PurchaseOrderFollowUp supabase={supabase}/></Suspense>}
    <Suspense fallback={null}><DocumentReviewQueue userId={profile.id}/></Suspense>
    {isAdmin && <Suspense fallback={null}><ComplianceReviewFollowUp userId={profile.id}/></Suspense>}
    {isAdmin && <Suspense fallback={null}><UnifiReviewFollowUp userId={profile.id}/></Suspense>}
    {isAdmin && <Suspense fallback={null}><UnifiInvoiceFollowUp/></Suspense>}
    <Suspense fallback={null}><SupplierMailSummary/></Suspense>
    <Suspense fallback={<DashboardSummaryLoading/>}>
      <DashboardContent name={profile.full_name} summary={summary}>
        {cleanerQueue && <Suspense fallback={null}><CleanerAssignmentFollowUp queue={cleanerQueue}/></Suspense>}
        {gymSummary && <Suspense fallback={null}><GymFollowUps summary={gymSummary}/></Suspense>}
        {isAdmin && <PaymentMailFollowUp/>}
        {isAdmin && <Suspense fallback={null}><ComplianceExpiryFollowUp/></Suspense>}
        <Suspense fallback={null}><MonitoringFollowUp/></Suspense>
      </DashboardContent>
    </Suspense>
  </AppShell>;
}
