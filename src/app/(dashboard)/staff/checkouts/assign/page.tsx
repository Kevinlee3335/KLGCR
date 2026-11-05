import Link from "next/link";
import {redirect} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {requireRole} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {assignCleaner} from "./actions";

type Queue = {rooms: {id:string;reference_no:string;room_no:string;block:string}[];cleaners:{id:string;name:string}[]};
export default async function Page({searchParams}:{searchParams:Promise<{error?:string;assigned?:string}>}) {
 const profile=await requireRole(["admin","cleaner"]);
 if(!["fikri","mary"].includes(profile.username)) redirect("/");
 const query=await searchParams; const db=await createClient();
 const {data,error}=await db.rpc("checkout_housekeeping_queue"); const queue=data as Queue|null;
 return <AppShell profile={profile} title="Assign Cleaner"><section className="panel"><h2>Rooms awaiting cleaner assignment</h2><p>Rooms appear here when repairs are complete, or when no repairs are needed.</p>{query.assigned&&<p className="success">Cleaner assigned successfully.</p>}{(error||query.error)&&<p className="error">{error?.message||query.error}</p>}{queue?.rooms.map(room=><form action={assignCleaner} key={room.id} className="panel"><h3>Block {room.block} · Room {room.room_no}</h3><p>{room.reference_no}</p><input type="hidden" name="room" value={room.id}/><div className="field"><label htmlFor={`cleaner-${room.id}`}>Cleaner</label><select id={`cleaner-${room.id}`} name="cleaner" required defaultValue=""><option value="">Select cleaner</option>{queue.cleaners.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><button className="button">Assign Cleaner</button></form>)}{!error&&!queue?.rooms.length&&<p>No rooms awaiting assignment.</p>}<Link href={profile.role==="admin"?"/admin/checkouts":"/staff/checkouts"}>Back to Check-out Rooms</Link></section></AppShell>;
}
