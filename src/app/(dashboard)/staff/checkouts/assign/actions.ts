"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAppNotifications } from "@/lib/app-notifications";

export async function assignCleaner(data: FormData) {
 const profile = await requireRole(["admin", "cleaner"]);
 if (!["fikri", "mary"].includes(profile.username)&&!profile.is_super_admin) redirect("/");
 const roomId = String(data.get("room") || "");
 const cleanerId = String(data.get("cleaner") || "");
 const db = await createClient();
 const {data: room, error} = await db.rpc("assign_checkout_cleaner", {p_room: roomId, p_cleaner: cleanerId});
 if (error || !room) redirect(`/staff/checkouts/assign?error=${encodeURIComponent(error?.message || "Unable to assign room")}`);
 try { await createAppNotifications({recipientIds:[cleanerId],type:"checkout_assigned",title:"New check-out room for cleaning",body:`${room.reference_no} — Room ${room.room_no} is ready for cleaning.`,href:`/staff/checkouts/${roomId}`,entityId:roomId}); } catch (error) { console.error("Unable to notify cleaner", error); }
 revalidatePath("/staff/checkouts/assign"); revalidatePath("/staff/checkouts"); revalidatePath("/admin/checkouts");
 redirect("/staff/checkouts/assign?assigned=1");
}
