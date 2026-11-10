"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {requireSuperAdmin} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";

export async function manageCheckoutAsSuperAdmin(id:string,data:FormData) {
 await requireSuperAdmin();
 const operation=String(data.get("operation")||"");
 const reason=String(data.get("reason")||"").trim();
 const valid=["complete_cleaning","reopen_cleaning","archive_duplicate","restore_archived"];
 const origin=operation==="restore_archived"?"/admin/super-admin":`/admin/checkouts/${id}`;
 if(!valid.includes(operation)||reason.length<3||reason.length>2000)
  redirect(`${origin}?error=${encodeURIComponent("Enter a valid action and a reason (3–2000 characters).")}`);
 if(operation==="archive_duplicate"&&data.get("confirm")!=="yes")
  redirect(`${origin}?error=${encodeURIComponent("Confirm that this is a duplicate record before archiving.")}`);

 const db=await createClient();
 const {error}=await db.rpc("super_admin_manage_checkout",{
  p_room:id,p_operation:operation,p_reason:reason
 });
 if(error)redirect(`${origin}?error=${encodeURIComponent(error.message)}`);
 for(const path of ["/admin","/admin/checkouts",`/admin/checkouts/${id}`,"/admin/super-admin","/staff/checkouts","/admin/checkouts/occupancy-report"])
  revalidatePath(path);
 if(operation==="archive_duplicate"||operation==="restore_archived")
  redirect(`/admin/super-admin?result=${operation}`);
 redirect(`/admin/checkouts/${id}?superAdminUpdated=1`);
}
