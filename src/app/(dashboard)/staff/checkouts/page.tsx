import { Suspense } from "react";
import { DirectPageLink } from "@/components/direct-page-link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { checkoutStatusLabel, type CheckoutRoom } from "@/lib/checkouts";
import { createClient } from "@/lib/supabase/server";

export default async function Page({ searchParams }: { searchParams: Promise<{ defectReported?: string }> }) {
  const { defectReported } = await searchParams;
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  const isCleaner = profile.role === "cleaner";
  return <AppShell profile={profile} title="Check-out Rooms">
    {["fadhil", "ariffin"].includes(profile.username) && <DirectPageLink className="button" href="/admin/checkouts/inspection">Room Inspection · Block A &amp; B</DirectPageLink>}
    {profile.username === "abdullah" && <DirectPageLink className="button secondary" href="/admin/checkouts/painting">Painting List</DirectPageLink>}
    <div className="section-head">
      <div>
        <p className="eyebrow">Room turnover</p>
        <h2>{isCleaner ? "Housekeeping handovers" : "Assigned rectifications"}</h2>
        <p className="subtle">{isCleaner ? "A dedicated workflow, separate from resident maintenance complaints." : "Rooms awaiting repairs appear first."}</p>
      </div>
    </div>
    {isCleaner && defectReported === "1" && <p className="success" role="status">Defect reported. The room is awaiting maintenance assignment.</p>}
    <Suspense fallback={<p className="subtle" role="status">Loading assigned rooms…</p>}>
      <RoomList userId={profile.id} isCleaner={isCleaner}/>
    </Suspense>
  </AppShell>;
}

async function RoomList({ userId, isCleaner }: { userId: string; isCleaner: boolean }) {
  const db = await createClient();
  const column = isCleaner ? "cleaner_id" : "assigned_to";
  const { data, error } = await db.from("checkout_rooms")
    .select("id,reference_no,room_no,utmspace_defects,status,block:blocks!block_id(code)")
    .is("deleted_at", null).is("batch_archived_at", null).eq(column, userId).order("updated_at", { ascending: false });
  const rows = (data || []) as unknown as Pick<CheckoutRoom, "id" | "reference_no" | "room_no" | "utmspace_defects" | "status" | "block">[];
  if (!isCleaner) {
    // Keep the latest updates first within each group and surface rooms that still need repair.
    rows.sort((first, second) => Number(second.status === "rectification") - Number(first.status === "rectification"));
  }

  return <section className="panel list-panel">
      {error && <p className="error" role="alert">{error.message}</p>}
      <div className="mobile-cards" style={{ display: "grid" }}>
        {rows.map((room) => <DirectPageLink className="panel record-card" href={`/staff/checkouts/${room.id}`} key={room.id}>
          <div className="record-head">
            <strong>{room.reference_no}</strong>
            <span className={`status-badge status-${room.status}`}>{checkoutStatusLabel[room.status]}</span>
          </div>
          <h3>Block {room.block?.code} · Room {room.room_no}</h3>
          <p>{room.utmspace_defects}</p>
        </DirectPageLink>)}
      </div>
      {!error && !rows.length && <div className="empty"><strong>No rooms assigned</strong><span>New handovers will appear here.</span></div>}
    </section>;
}
