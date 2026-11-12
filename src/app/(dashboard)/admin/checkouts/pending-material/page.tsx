import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { checkoutMaintenanceKey, type CheckoutStatusReport } from "@/components/checkout-status-dashboard";
import styles from "@/components/checkout-status-table.module.css";
import { requireRole } from "@/lib/auth";
import { malaysiaDate } from "@/lib/checkout-occupancy-report";
import { loadCheckoutOverviewRooms } from "@/lib/checkout-progress.server";
import { materialLineStatus, type MaterialLine } from "@/lib/material-request-state";
import { createClient } from "@/lib/supabase/server";

const requestColumns = "id,request_no,checkout_room_id,note,items:material_request_items(id,other_item_name,requested_qty,approved_qty,issued_qty,item:inventory_items(description,unit))";

type OpenRequest = {
  id: string;
  request_no: string;
  checkout_room_id: string;
  note: string | null;
  items: (MaterialLine & {
    id: string;
    other_item_name: string | null;
    item: { description: string; unit: string | null } | null;
  })[];
};

async function loadRequests(db: Awaited<ReturnType<typeof createClient>>, roomIds: string[]) {
  const batchSize = 100;
  const batches = Array.from({ length: Math.ceil(roomIds.length / batchSize) }, (_, index) =>
    roomIds.slice(index * batchSize, (index + 1) * batchSize));
  const results = await Promise.all(batches.map(ids => db.from("material_requests")
    .select(requestColumns)
    .in("checkout_room_id", ids)
    .in("status", ["pending", "approved"])
    .order("request_no")
    .order("id")
    .overrideTypes<OpenRequest[], { merge: false }>()));
  return {
    requests: results.flatMap(result => result.data ?? []),
    error: results.some(result => result.error),
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ staff?: string; room?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const { staff, room: roomId } = await searchParams;
  const db = await createClient();
  const [report, overview] = await Promise.all([
    db.rpc("checkout_status_report", { p_date: malaysiaDate(), p_group: "ALL" }),
    staff ? loadCheckoutOverviewRooms(db) : null,
  ]);
  const reportError = report.error || overview?.error || !report.data;
  const defectRooms = new Set(overview?.rooms.filter(room => room.defect_count > 0).map(room => room.id));
  const rooms = reportError ? [] : (report.data as CheckoutStatusReport).rooms
    .filter(room => room.maintenance_status === "Pending Material"
      && (!roomId || room.id === roomId)
      && (!staff || (checkoutMaintenanceKey(room) === staff && defectRooms.has(room.id))))
    .sort((a, b) => a.block.localeCompare(b.block) || a.room_no.localeCompare(b.room_no, undefined, { numeric: true }));
  const { requests, error: requestError } = await loadRequests(db, rooms.map(room => room.id));
  const requestsByRoom = new Map<string, typeof requests>();
  for (const request of requests) {
    const roomRequests = requestsByRoom.get(request.checkout_room_id) ?? [];
    roomRequests.push(request);
    requestsByRoom.set(request.checkout_room_id, roomRequests);
  }

  return (
    <AppShell profile={profile} title="Pending Material">
      <div className="section-head">
        <div>
          <h2>{staff && rooms.length > 0 ? `Pending Material · ${rooms[0].maintenance}` : "Pending Material"}</h2>
          {!reportError && <p className="subtle">{rooms.length} {rooms.length === 1 ? "room" : "rooms"}</p>}
        </div>
        <Link className="button secondary" href="/admin/checkouts">Back to Check-out Rooms</Link>
      </div>
      {reportError && <p className="error">Unable to load pending rooms. Please refresh.</p>}
      {requestError && <p className="error">Some material requests could not be loaded. Please refresh.</p>}
      {!reportError && rooms.length === 0 && <p className="subtle">No rooms pending material.</p>}
      {rooms.map(room => (
        <section className={`panel ${styles.panel}`} key={room.id}>
          <h3><Link className={styles.roomLink} href={`/admin/checkouts/${room.id}`}>
            Block {room.block} · {room.room_no}
          </Link></h3>
          <p className="subtle">Maintenance · {room.maintenance}</p>
          {(requestsByRoom.get(room.id) ?? []).map(request => {
            const pendingItems = request.items.filter(item => materialLineStatus(item) !== "Issued");
            return (
              <div key={request.id}>
                <h4>{request.request_no}</h4>
                {request.note && <p>{request.note}</p>}
                {pendingItems.length === 0 ? <p className="subtle">No outstanding items in this request.</p> : (
                  <div className="table-wrap">
                    <table className="table" aria-label={`Outstanding items for ${request.request_no}`}>
                      <thead><tr><th scope="col">Material</th><th scope="col">Requested Qty</th><th scope="col">Status</th></tr></thead>
                      <tbody>{pendingItems.map(line => {
                        const status = materialLineStatus(line);
                        return (
                          <tr key={line.id}>
                            <td>{line.item?.description || line.other_item_name || "—"}</td>
                            <td>{line.requested_qty} {line.item?.unit}</td>
                            <td><span className={`status-badge status-${status.toLowerCase()}`}>
                              {status === "Approved" ? "Awaiting issue" : "Pending approval"}
                            </span></td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {!requestsByRoom.has(room.id) && !requestError && <p className="subtle">No open material request found.</p>}
        </section>
      ))}
    </AppShell>
  );
}
