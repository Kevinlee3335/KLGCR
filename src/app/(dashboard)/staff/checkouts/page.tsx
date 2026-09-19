import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CleanerCheckoutQueue, type CleanerCheckoutRoom } from "@/components/cleaner-checkout-queue";
import { requireRole } from "@/lib/auth";
import { checkoutStatusLabel, type CheckoutRoom } from "@/lib/checkouts";
import { createClient } from "@/lib/supabase/server";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  const query = await searchParams;
  const db = await createClient();
  const column = profile.role === "cleaner" ? "cleaner_id" : "assigned_to";
  const { data, error } = await db.from("checkout_rooms")
    .select("id,reference_no,room_no,utmspace_defects,inspection_notes,status,assigned_to,cleaner_id,created_at,ready_at,block:blocks!block_id(code),assignee:profiles!assigned_to(full_name),cleaner:profiles!cleaner_id(full_name)")
    .eq(column, profile.id)
    .order("updated_at", { ascending: false });
  const rows = (data || []) as unknown as CheckoutRoom[];

  return (
    <AppShell profile={profile} title="Check-out Rooms">
      <div className="section-head">
        <div>
          <p className="eyebrow">Room turnover</p>
          <h2>{profile.role === "cleaner" ? "Housekeeping handovers" : "Assigned rectifications"}</h2>
          <p className="subtle">{profile.role === "cleaner" ? "Search, filter and complete rooms in batches. Open a room only if you need to report a newly found defect." : "A dedicated workflow, separate from resident maintenance complaints."}</p>
        </div>
      </div>
      {profile.role === "cleaner" ? (
        <CleanerCheckoutQueue rooms={rows as unknown as CleanerCheckoutRoom[]} error={query.error} success={query.success} />
      ) : (
        <section className="panel list-panel">
          {error && <p className="error">{error.message}</p>}
          <div className="mobile-cards" style={{ display: "grid" }}>
            {rows.map((room) => <Link className="panel record-card" href={`/staff/checkouts/${room.id}`} key={room.id}>
              <div className="record-head"><strong>{room.reference_no}</strong><span className={`status-badge status-${room.status}`}>{checkoutStatusLabel[room.status]}</span></div>
              <h3>Block {room.block?.code} · Room {room.room_no}</h3><p>{room.utmspace_defects}</p>
            </Link>)}
          </div>
          {!rows.length && <div className="empty"><strong>No rooms assigned</strong><span>New handovers will appear here.</span></div>}
        </section>
      )}
    </AppShell>
  );
}
