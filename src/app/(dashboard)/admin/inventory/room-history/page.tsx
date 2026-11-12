import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const path = "/admin/inventory/room-history";
const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });

type RoomMaterialUsage = {
  request_item_id: string;
  qty: number;
  issued_at: string;
  replaced_at: string | null;
  legacy_issue: boolean;
  used_qty: number | null;
  line: {
    item: { item_code: string; description: string; unit: string | null } | null;
    request: { request_no: string; staff: { full_name: string } | null } | null;
  } | null;
};

export default async function RoomMaterialHistory({ searchParams }: {
  searchParams: Promise<{ room?: string; material?: string; year?: string; result?: string }>;
}) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const params = await searchParams;
  const room = (params.room ?? "").trim().toUpperCase();
  const material = (params.material ?? "").trim().slice(0, 100);
  const today = dateFormat.format(new Date());
  const year = /^20\d{2}$/.test(params.year ?? "") ? params.year! : today.slice(0, 4);
  const validRoom = /^[A-D]\d{3}$/.test(room);
  const supabase = await createClient();
  const query = supabase.from("material_room_usage")
    .select("request_item_id,qty,issued_at,replaced_at,legacy_issue,used_qty,line:material_request_items(item:inventory_items(item_code,description,unit),request:material_requests(request_no,staff:profiles!requested_by(full_name)))")
    .eq("room_no", room).not("issued_at", "is", null)
    .order("issued_at", { ascending: false }).order("request_item_id")
    .overrideTypes<RoomMaterialUsage[], { merge: false }>();
  const first = validRoom ? await query.range(0, 499) : null;
  const rows = first?.data ?? [];
  let failed = Boolean(first?.error);
  for (let offset = 500; validRoom && !failed && rows.length === offset; offset += 500) {
    const page = await query.range(offset, offset + 499);
    if (page.error) failed = true;
    else rows.push(...page.data);
  }
  const matches = rows.filter(({ line }) => {
    const item = line?.item;
    return !material || [item?.item_code, item?.description].some(value => value?.toLowerCase().includes(material.toLowerCase()));
  });
  const confirmed = matches.filter(row => row.replaced_at && dateFormat.format(new Date(row.replaced_at)).startsWith(year));
  const visible = matches.filter(row => dateFormat.format(new Date(row.replaced_at ?? row.issued_at)).startsWith(year));

  return <AppShell profile={profile} title="Room Material History">
    <div className="section-head">
      <h2>Room Material History</h2>
      <Link className="button secondary" href="/admin/inventory">Back to Inventory</Link>
    </div>
    <section className="panel">
      <form method="get" action={path} className="inventory-form">
        <label><span>Room</span><input name="room" placeholder="A110" defaultValue={room} pattern="[A-Da-d][0-9]{3}" required /></label>
        <label><span>Material</span><input name="material" placeholder="Flexible hose" defaultValue={material} maxLength={100} /></label>
        <label><span>Year</span><input name="year" type="number" min="2000" max="2099" defaultValue={year} required /></label>
        <div><button className="button" type="submit">Search</button></div>
      </form>
      {params.result === "saved" && <p className="success">Replacement confirmed.</p>}
      {params.result === "error" && <p className="error">Unable to confirm. Check that the date is between the issue date and today and the quantity used does not exceed the quantity issued.</p>}
      {failed && <p className="error">Unable to load the complete history. Please try again.</p>}
      {validRoom && !failed && <>
        <p><strong>{room} · {year} · {confirmed.length} confirmed {confirmed.length === 1 ? "replacement" : "replacements"}</strong></p>
        <p className="subtle">Each confirmation counts as one replacement for that material and room. Confirm only after the material is installed.</p>
        {visible.length === 0 ? <p className="dashboard-empty">No matching records for this year.</p> :
          <div className="table-wrap"><table className="table inventory-table">
            <thead><tr><th>Material</th><th>Request / Staff</th><th>Qty</th><th>Issued</th><th>Replacement</th></tr></thead>
            <tbody>{visible.map(row => {
              const item = row.line?.item;
              const request = row.line?.request;
              const issued = dateFormat.format(new Date(row.issued_at));
              return <tr key={row.request_item_id}>
                <td><strong>{item?.description ?? "Material"}</strong><small>{item?.item_code}</small></td>
                <td>{request?.request_no}<small>{request?.staff?.full_name}</small></td>
                <td>{row.qty} {item?.unit}</td><td>{issued}</td>
                <td>{row.replaced_at ? <>{dateFormat.format(new Date(row.replaced_at))}<small>Used: {row.used_qty} {item?.unit}</small></> : row.legacy_issue ? "Historical issue · Source room only" : <>
                  <span>Issued · Awaiting confirmation</span>
                  {profile.role === "admin" && <form action={path + "/confirm"} method="post" className="inventory-form mini">
                    <input type="hidden" name="itemId" value={row.request_item_id} />
                    <input type="hidden" name="room" value={room} />
                    <input type="hidden" name="material" value={material} />
                    <input type="hidden" name="year" value={year} />
                    <label><span>Replacement date</span><input name="replacedOn" type="date" defaultValue={today} min={issued} max={today} required /></label>
                    <label><span>Quantity used</span><input name="usedQty" type="number" min="0.01" step="0.01" max={row.qty} defaultValue={row.qty} required /></label>
                    <div><button className="button secondary" type="submit">Confirm replacement</button></div>
                  </form>}
                </>}</td>
              </tr>;
            })}</tbody>
          </table></div>}
      </>}
    </section>
  </AppShell>;
}
