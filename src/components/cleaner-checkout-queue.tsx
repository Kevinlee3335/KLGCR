"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { completeSelectedCleaning } from "@/app/(dashboard)/staff/checkouts/actions";
import { SubmitButton } from "@/components/submit-button";

export type CleanerCheckoutRoom = {
  id: string;
  reference_no: string;
  room_no: string;
  utmspace_defects: string;
  status: string;
  block: { code: string } | null;
};

const label: Record<string, string> = {
  cleaning: "Cleaning",
  verification: "Admin verification",
  ready_for_occupancy: "Ready for Occupancy",
};

export function CleanerCheckoutQueue({ rooms, error, success }: { rooms: CleanerCheckoutRoom[]; error?: string; success?: string }) {
  const [search, setSearch] = useState("");
  const [block, setBlock] = useState("all");
  const [status, setStatus] = useState("cleaning");
  const [selected, setSelected] = useState<string[]>([]);
  const blocks = Array.from(new Set(rooms.map((room) => room.block?.code).filter(Boolean))) as string[];

  const shown = useMemo(() => rooms.filter((room) => {
    const haystack = `${room.reference_no} ${room.room_no} ${room.block?.code || ""} ${room.utmspace_defects}`.toLowerCase();
    return (block === "all" || room.block?.code === block)
      && (status === "all" || room.status === status)
      && haystack.includes(search.trim().toLowerCase());
  }), [rooms, block, status, search]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    const selectable = shown.filter((room) => room.status === "cleaning").map((room) => room.id);
    setSelected((current) => selectable.every((id) => current.includes(id))
      ? current.filter((id) => !selectable.includes(id))
      : Array.from(new Set([...current, ...selectable])));
  }

  const selectedCleanable = selected.filter((id) => rooms.some((room) => room.id === id && room.status === "cleaning")).length;

  return (
    <section className="panel cleaner-queue">
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      <div className="cleaner-queue-toolbar">
        <label><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Room, block or defect" /></label>
        <label><span>Block</span><select value={block} onChange={(event) => setBlock(event.target.value)}><option value="all">All blocks</option>{blocks.map((code) => <option key={code} value={code}>Block {code}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="cleaning">Ready to clean</option><option value="verification">Sent to Admin</option><option value="all">All statuses</option></select></label>
      </div>

      <form action={completeSelectedCleaning}>
        <div className="cleaner-bulk-bar">
          <label className="select-all"><input type="checkbox" checked={shown.filter((room) => room.status === "cleaning").length > 0 && shown.filter((room) => room.status === "cleaning").every((room) => selected.includes(room.id))} onChange={toggleAll} /> Select all shown</label>
          <SubmitButton className="button" pendingText="Completing…">{selectedCleanable ? `Complete ${selectedCleanable} selected room${selectedCleanable === 1 ? "" : "s"}` : "Complete selected rooms"}</SubmitButton>
        </div>
        <div className="mobile-cards cleaner-room-cards">
          {shown.map((room) => (
            <article className="panel record-card cleaner-room-card" key={room.id}>
              <label className="room-select"><input name="checkoutIds" type="checkbox" value={room.id} disabled={room.status !== "cleaning"} checked={selected.includes(room.id)} onChange={() => toggle(room.id)} /><span className="sr-only">Select {room.room_no}</span></label>
              <Link href={`/staff/checkouts/${room.id}`} className="cleaner-room-link">
                <div className="record-head"><strong>{room.reference_no}</strong><span className={`status-badge status-${room.status}`}>{label[room.status] || room.status}</span></div>
                <h3>Block {room.block?.code} · Room {room.room_no}</h3>
                <p>{room.utmspace_defects}</p>
              </Link>
            </article>
          ))}
        </div>
      </form>
      {!shown.length && <div className="empty"><strong>No matching rooms</strong><span>Try another search or filter.</span></div>}
    </section>
  );
}
