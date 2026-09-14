import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type RoomRow = { id: string; room_no: string; reference_no: string; block: { code: string } | null };

export default async function CleanerDashboard() {
  const profile = await requireRole(["cleaner"]);
  const db = await createClient();
  const { data } = await db.from("checkout_rooms")
    .select("id,room_no,reference_no,block:blocks!block_id(code)")
    .eq("cleaner_id", profile.id)
    .eq("status", "cleaning")
    .order("updated_at", { ascending: true });
  const rooms = (data || []) as unknown as RoomRow[];
  const blocks = ["A", "B", "C", "D"];
  const countByBlock = new Map(blocks.map((block) => [block, rooms.filter((room) => room.block?.code === block).length]));

  return (
    <AppShell profile={profile} title="My Dashboard">
      <div className="section-head">
        <div>
          <p className="eyebrow">Housekeeping overview</p>
          <h2>Today&apos;s cleaning rooms</h2>
          <p className="subtle">Only rooms handed over to you are shown here.</p>
        </div>
        <Link href="/staff/checkouts" className="button button-link">Open room list</Link>
      </div>
      <section className="metrics cleaner-dashboard-metrics">
        <article className="panel metric cleaner-total"><span className="subtle">To clean</span><div className="value">{rooms.length}</div><small>Assigned to you</small></article>
        {blocks.map((block) => <article className="panel metric" key={block}><span className="subtle">Block {block}</span><div className="value">{countByBlock.get(block) || 0}</div><small>Not cleaned yet</small></article>)}
      </section>
      <section className="panel cleaner-dashboard-list">
        <div><h3>Rooms waiting for cleaning</h3><p className="subtle">Use Check-out Rooms to select many rooms and complete them together.</p></div>
        {rooms.length ? <div className="cleaner-dashboard-rooms">{rooms.map((room) => <Link key={room.id} href={`/staff/checkouts/${room.id}`}><strong>Block {room.block?.code} · Room {room.room_no}</strong><span>{room.reference_no}</span></Link>)}</div> : <div className="empty"><strong>No rooms waiting</strong><span>You have completed every assigned cleaning room.</span></div>}
      </section>
    </AppShell>
  );
}
