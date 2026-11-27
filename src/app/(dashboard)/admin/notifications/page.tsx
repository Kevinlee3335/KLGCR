import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadTenantNoShows } from "@/lib/tenant-no-shows.server";
import { formatMalaysiaActivity } from "@/lib/job-activity";

type Database = Awaited<ReturnType<typeof createClient>>;
type Count = Promise<number | null>;

async function readCount(query: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await query;
  return error ? null : count;
}

async function stockCounts(db: Database) {
  let out = 0;
  let near = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("inventory_items").select("balance_qty,reorder_level")
      .eq("is_active", true).order("id").range(offset, offset + 999);
    if (error) return null;
    for (const item of data ?? []) {
      const balance = Number(item.balance_qty);
      if (balance === 0) out++;
      if (balance > 0 && balance <= Number(item.reorder_level)) near++;
    }
    if (!data || data.length < 1000) return { out, near };
  }
}

async function Value({ count }: { count: Count }) {
  return (await count) ?? "—";
}

export default async function NotificationsPage() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const db = await createClient();
  const noShows = loadTenantNoShows(db);
  const stock = stockCounts(db);
  const summaryCards = [
    ["New Complaints", readCount(db.from("complaints").select("id", { count: "exact", head: true }).eq("status", "new")), "/admin/complaints?status=new", "Waiting for review", "blue"],
    ["Tenant Not Available", noShows.then(rows => rows?.length ?? null), "#tenant-not-available", "Needs another appointment", "danger"],
    ["Pending Material", readCount(db.from("maintenance_jobs").select("id", { count: "exact", head: true }).eq("status", "pending_material")), "/admin/jobs?status=pending_material", "Waiting for stock", "amber"],
    ["Under Monitoring", readCount(db.from("maintenance_jobs").select("id", { count: "exact", head: true }).eq("status", "under_monitoring")), "/admin/jobs?status=under_monitoring", "Follow-up required", "purple"],
    ["Out of Stock", stock.then(counts => counts?.out ?? null), "/admin/inventory", "No balance available", "danger"],
    ["Near Reorder", stock.then(counts => counts?.near ?? null), "/admin/inventory", "At reorder level", "gold"],
  ] as const;
  const total = Promise.all(summaryCards.map(([, count]) => count))
    .then(counts => counts.every(value => value !== null) ? counts.reduce((sum, value) => sum + value, 0) : null);

  return <AppShell profile={profile} title="Notifications">
    <div className="notification-centre">
      <header className="notification-hero">
        <div><p className="eyebrow">Operations alerts</p><h2>Attention Centre</h2><p>Items that need Admin review, rescheduling or follow-up.</p></div>
        <div className="notification-total"><span>Open alerts</span><strong><Suspense fallback="…"><Value count={total}/></Suspense></strong></div>
      </header>

      <section className="notification-summary-grid" aria-label="Notification summary">
        {summaryCards.map(([label,value,href,note,tone])=><Link href={href} key={label} className={`notification-summary-card notification-${tone}`}>
          <span>{label}</span><strong><Suspense fallback="…"><Value count={value}/></Suspense></strong><small>{note}</small>
        </Link>)}
      </section>

      <section id="tenant-not-available" className="tenant-notification-panel">
        <div className="tenant-notification-head">
          <div><p className="eyebrow">Appointment attention</p><h3>Tenant Not Available</h3><p>Arrange another visit for every open item below.</p></div>
          <span className="tenant-notification-count"><Suspense fallback="…"><Value count={summaryCards[1][1]}/></Suspense> open</span>
        </div>
        <Suspense fallback={<p className="subtle" role="status">Loading tenant visits…</p>}>
          <TenantVisits source={noShows}/>
        </Suspense>
      </section>
    </div>
  </AppShell>;
}

async function TenantVisits({ source }: { source: ReturnType<typeof loadTenantNoShows> }) {
  const tenantNoShows = await source;
  if (!tenantNoShows) return <p className="error" role="alert">Unable to load tenant visits. Please refresh.</p>;
  return tenantNoShows.length===0
          ? <div className="notification-empty"><strong>All tenant visits are up to date</strong><span>No appointments currently need rescheduling.</span></div>
          : <div className="tenant-notification-list">{tenantNoShows.map((row)=>{
            const occurred=formatMalaysiaActivity(row.attended_at||`${row.appointment_date}T${row.appointment_time}+08:00`);
            return <Link href={`/admin/jobs/${row.job!.id}`} key={row.id} className="tenant-notification-row">
              <div className="tenant-notification-location"><span>Block {row.job!.block?.code??"–"}</span><strong>{row.job!.room_no}</strong></div>
              <div className="tenant-notification-main">
                <div><strong>{row.job!.job_no}</strong><span className="status-badge status-pending_material">Needs rescheduling</span></div>
                <p>Original appointment: {row.appointment_date} at {row.appointment_time.slice(0,5)}</p>
                <small>Reported {occurred.date}, {occurred.time}{row.attendee?.full_name?` by ${row.attendee.full_name}`:""}</small>
                {row.no_show_remarks&&<blockquote>{row.no_show_remarks}</blockquote>}
              </div>
              <span className="tenant-notification-action">Open job →</span>
            </Link>;
          })}</div>;
}
