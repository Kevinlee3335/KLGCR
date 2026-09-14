import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { checkoutStatusLabel, type CheckoutRoom } from "@/lib/checkouts";
import { createClient } from "@/lib/supabase/server";
import { CheckoutDefectProgressControls } from "@/components/checkout-defect-progress-controls";
import { completeCleaning, completeRectification } from "../actions";

const defectStatusLabel: Record<string, string> = { open: "In Progress", rectified: "Completed" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  const { id } = await params;
  const query = await searchParams;
  const db = await createClient();
  const [{ data: roomRow }, { data: defectRows }, { data: events }] = await Promise.all([
    db.from("checkout_rooms").select("id,reference_no,room_no,utmspace_defects,inspection_notes,status,assigned_to,cleaner_id,created_at,ready_at,block:blocks!block_id(code),assignee:profiles!assigned_to(full_name),cleaner:profiles!cleaner_id(full_name)").eq("id", id).single(),
    db.from("checkout_defects").select("id,description,source,status").eq("checkout_room_id", id).order("created_at"),
    db.from("checkout_history").select("id,action,notes,created_at,actor:profiles!actor_id(full_name)").eq("checkout_room_id", id).order("created_at", { ascending: false }),
  ]);
  if (!roomRow) notFound();

  const room = roomRow as unknown as CheckoutRoom;
  const defects = defectRows || [];
  const outstandingDefects = defects.filter((defect) => defect.status === "open").length;

  return (
    <AppShell profile={profile} title="Check-out Room">
      <div className="checkout-hero panel">
        <div><p className="eyebrow">{room.reference_no}</p><h2>Block {room.block?.code} · Room {room.room_no}</h2></div>
        <span className={`status-badge status-${room.status}`}>{checkoutStatusLabel[room.status]}</span>
      </div>
      {query.error && <p className="error">{query.error}</p>}

      <div className="checkout-grid">
        <section className="panel">
          <h3>Defects to rectify</h3>
          <p className="subtle">{profile.role === "maintenance_staff" ? "Update each Defect as work progresses. Complete rectification only after every item is completed." : "Maintenance is working through these defects."}</p>
          <div className="defect-list checkout-staff-defects">
            {defects.map((defect) => (
              <div key={defect.id} className="defect-row defect-row-actionable">
                <div className="defect-detail">
                  <span className={`status-badge status-${defect.status === "open" ? "in_progress" : "rectified"}`}>{defectStatusLabel[defect.status] || defect.status}</span>
                  <strong>{defect.description}</strong>
                  <small>{defect.source.replaceAll("_", " ")}</small>
                </div>
                {profile.role === "maintenance_staff" && room.status === "rectification" && (
                  <CheckoutDefectProgressControls checkoutId={id} defectId={defect.id} status={defect.status} />
                )}
              </div>
            ))}
          </div>
          {room.inspection_notes && <><h3>Inspection notes</h3><p>{room.inspection_notes}</p></>}
        </section>

        <section className="panel">
          <h3>Complete your stage</h3>
          {profile.role === "maintenance_staff" && room.status === "rectification" ? (
            outstandingDefects > 0 ? <p className="subtle">{outstandingDefects} Defect{outstandingDefects === 1 ? "" : "s"} still In Progress. Update each Defect on the left before completing rectification.</p> :
            <form action={completeRectification.bind(null, id)}>
              <div className="field"><label>Rectification notes</label><textarea name="notes" required rows={4} /></div>
              <div className="field"><label>Completion photo</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
              <button className="button">Complete rectification</button>
            </form>
          ) : profile.role === "cleaner" && room.status === "cleaning" ? (
            <form action={completeCleaning.bind(null, id)}>
              <div className="field"><label>Cleaning notes</label><textarea name="notes" required rows={4} /></div>
              <div className="field"><label>Cleaning completion photo</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
              <button className="button">Report cleaning completed</button>
            </form>
          ) : <p className="subtle">Your work for this room is complete, or it is awaiting another team.</p>}
        </section>
      </div>

      <section className="panel"><h3>History</h3><div className="history-list">{events?.map((event) => <div key={event.id}><strong>{event.action.replaceAll("_", " ")}</strong><span>{(event.actor as unknown as { full_name: string } | null)?.full_name} · {new Date(event.created_at).toLocaleString("en-MY")}</span>{event.notes && <p>{event.notes}</p>}</div>)}</div></section>
    </AppShell>
  );
}
