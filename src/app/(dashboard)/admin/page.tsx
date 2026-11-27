import { CheckoutDefectFollowUp } from "@/components/checkout-defect-follow-up";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ComplianceExpiryFollowUp } from "@/components/compliance-expiry-follow-up";
import { ComplianceReviewFollowUp } from "@/components/compliance-review-follow-up";
import { AdminDashboardFrame, DashboardMetrics, InventoryAlerts, JobsOverview, RecentComplaints, TenantAlerts, TodayTasks, type AdminDashboardData } from "@/components/dashboard";
import { DashboardActionFollowUp } from "@/components/dashboard-action-follow-up";
import { DocumentReviewQueue } from "@/components/document-review-queue";
import { MonitoringFollowUp } from "@/components/monitoring-follow-up";
import { PaymentMailFollowUp } from "@/components/payment-mail-follow-up";
import { PoApprovalQueue } from "@/components/po-approval-queue";
import { SupplierMailSummary } from "@/components/supplier-mail-summary";
import { UnifiPaymentFollowUp } from "@/components/unifi-payment-follow-up";
import { UnifiInvoiceFollowUp } from "@/components/unifi-invoice-follow-up";
import { UnifiReviewFollowUp } from "@/components/unifi-review-follow-up";
import { loadAdminDashboardWorkload } from "@/lib/admin-dashboard-workload";
import { loadTenantNoShows } from "@/lib/tenant-no-shows.server";
import { requireRole } from "@/lib/auth";
import { FLEX_INSPECTION_PATH } from "@/lib/flex-inspection";
import { flexInspectionsAwaitingReview, flexReviewer, isFlexPreview } from "@/lib/flex-inspection-review-store";
import { membershipEnabled } from "@/lib/membership";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type DashboardClient = Awaited<ReturnType<typeof createClient>>;

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function PurchaseOrderFollowUp({ supabase }: { supabase: DashboardClient }) {
  const { data, error, count } = await supabase.from("inventory_purchase_orders")
    .select("id,po_no,requested_by,revision", { count: "exact" })
    .is("approved_at", null).order("created_at", { ascending: true }).limit(10);

  return error
    ? <section className="panel"><p role="alert">Unable to load purchase orders awaiting approval. Please refresh.</p></section>
    : <PoApprovalQueue orders={data || []} total={count || 0}/>;
}

async function FlexInspectionFollowUp({ userId }: { userId: string }) {
  const rows = await flexInspectionsAwaitingReview(userId).catch(() => null);
  if (!rows?.length) return null;
  return <DashboardActionFollowUp
    title="Flex Inspection Verification"
    subtitle="Completed Flex inspections awaiting your verification."
    count={rows.length}
    items={rows.map(({ period, inspection_date }) => ({
      id: period, name: period, detail: `Inspected on ${inspection_date}`,
      href: `${FLEX_INSPECTION_PATH}?period=${period}`,
    }))}
    href={FLEX_INSPECTION_PATH}
    action="Open inspection"
    nameColumn="Inspection month"
  />;
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

async function DashboardResult<T>({ source, render }: { source: PromiseLike<T>; render: (value: T) => ReactNode }) {
  return render(await source);
}

function stream<T>(source: PromiseLike<T>, render: (value: T) => ReactNode, fallback: ReactNode = null) {
  return <Suspense fallback={fallback}><DashboardResult source={source} render={render}/></Suspense>;
}

function DashboardContent({ db, name, children }: { db: DashboardClient; name: string; children: ReactNode }) {
  const today = malaysiaToday();
  const counts = Promise.resolve(db.rpc("admin_dashboard_counts"));
  const workload = loadAdminDashboardWorkload(db);
  const noShows = loadTenantNoShows(db);
  const intake = db.rpc("complaint_intake_summary", { p_date: today, p_group: "ALL" });
  const kiv = db.from("complaints").select("id", { count: "exact", head: true }).eq("status", "kiv");
  const appointments = db.from("appointments").select("id", { count: "exact", head: true })
    .eq("appointment_date", today).not("status", "in", '("cancelled","no_show")');
  const photos = db.from("maintenance_jobs").select("id", { count: "exact", head: true })
    .eq("status", "completed").gte("completed_at", "2026-09-27T00:00:00+08:00");
  const waiting = db.from("maintenance_jobs").select("id", { count: "exact", head: true }).eq("status", "waiting_checkout");
  const complaints = db.from("complaints").select("id,complaint_no,room_no,category,description,priority,status,submitted_at,block:blocks!block_id(code)")
    .order("submitted_at", { ascending: false }).limit(5);
  const tasks = db.from("maintenance_jobs").select("id,job_no,room_no,description,status,scheduled_for,assigned_at,complaint:complaints!inner(room_access_permission),block:blocks!block_id(code),assignee:profiles!assigned_to(full_name)")
    .eq("scheduled_for", today).neq("complaint.room_access_permission", "no").not("status", "in", '("completed","cancelled")')
    .order("assigned_at", { ascending: true }).limit(5);

  const count = (source: PromiseLike<{ count: number | null; error: unknown }>) =>
    stream(source, result => result.error ? "—" : result.count ?? "—", "…");
  const total = (field: "new_complaints" | "today_tasks" | "completed_today") =>
    stream(counts, result => result.error ? "—" : result.data?.[0]?.[field] ?? "—", "…");
  const jobCount = (field: "in_progress" | "pending_material" | "under_monitoring") =>
    stream(workload, result => result.jobs[field], "…");
  const metrics = <DashboardMetrics intakeDate={today}
    intakeTotal={stream(intake, result => result.error ? "—" : result.data?.total ?? "—", "…")}
    values={{
      newComplaints: total("new_complaints"), todayJobs: total("today_tasks"), completedToday: total("completed_today"),
      inProgress: jobCount("in_progress"), pendingMaterial: jobCount("pending_material"), underMonitoring: jobCount("under_monitoring"),
      tenantNotAvailable: stream(noShows, rows => rows?.length ?? "—", "…"), kivComplaints: count(kiv),
      completionPhotos: count(photos), todayAppointments: count(appointments),
    }}/>;
  return <AdminDashboardFrame name={name} summary={metrics} monitoringFollowUp={children}
    tenantAlerts={stream(noShows, rows => rows && <TenantAlerts rows={rows}/>)}>
    {stream(Promise.all([workload, waiting]), ([summary, checkout]) =>
      checkout.error ? <p className="error" role="alert">Unable to load the jobs overview.</p>
        : <JobsOverview jobs={{ ...summary.jobs, waiting_checkout: checkout.count ?? 0 }}/>)}
    {stream(complaints, result => result.error ? <p className="error" role="alert">Unable to load recent complaints.</p>
      : <RecentComplaints rows={(result.data ?? []) as unknown as AdminDashboardData["complaints"]}/>)}
    {stream(tasks, result => result.error ? <p className="error" role="alert">Unable to load today&apos;s tasks.</p>
      : <TodayTasks rows={(result.data ?? []) as unknown as AdminDashboardData["tasks"]}/>)}
    {stream(workload, result => <InventoryAlerts inventory={result.inventory}/>)}
  </AdminDashboardFrame>;
}

export default async function AdminPage() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const supabase = await createClient();
  const isAdmin = profile.role === "admin";
  const isPoApprover = isAdmin && profile.id === "eeab5f04-30c3-42bd-a095-58e56c814358";
  const isCleanerCoordinator = isAdmin && ["mary", "fikri"].includes(profile.username);
  const cleanerQueue = isCleanerCoordinator ? loadCleanerQueue(supabase) : null;
  const gymSummary = isAdmin && membershipEnabled() ? loadGymFollowUps() : null;

  return <AppShell profile={profile} title="Dashboard">
    {isPoApprover && <Suspense fallback={null}><PurchaseOrderFollowUp supabase={supabase}/></Suspense>}
    {flexReviewer(profile) && !isFlexPreview() && <Suspense fallback={null}><FlexInspectionFollowUp userId={profile.id}/></Suspense>}
    <Suspense fallback={null}><DocumentReviewQueue userId={profile.id}/></Suspense>
    {isAdmin && <Suspense fallback={null}><ComplianceReviewFollowUp userId={profile.id}/></Suspense>}
    {isAdmin && <Suspense fallback={null}><UnifiReviewFollowUp userId={profile.id}/></Suspense>}
    {isAdmin && <Suspense fallback={null}><UnifiInvoiceFollowUp/></Suspense>}
    {isAdmin && <Suspense fallback={null}><UnifiPaymentFollowUp/></Suspense>}
    <Suspense fallback={null}><SupplierMailSummary/></Suspense>
    <DashboardContent name={profile.full_name} db={supabase}>
      {cleanerQueue && <Suspense fallback={null}><CleanerAssignmentFollowUp queue={cleanerQueue}/></Suspense>}
      {gymSummary && <Suspense fallback={null}><GymFollowUps summary={gymSummary}/></Suspense>}
      {isAdmin && <PaymentMailFollowUp/>}
      {isAdmin && <Suspense fallback={null}><ComplianceExpiryFollowUp/></Suspense>}
        <Suspense fallback={null}><CheckoutDefectFollowUp/></Suspense>
        <Suspense fallback={null}><MonitoringFollowUp/></Suspense>
    </DashboardContent>
  </AppShell>;
}
