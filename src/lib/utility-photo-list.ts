import type { UtilityAccount } from "./billing-preview";
import type { createAdminClient } from "./supabase/admin";
import { utilityPhotoData } from "./utility-photo-access";

export async function listUtilityPhotos(db: ReturnType<typeof createAdminClient>, accountId: string | null, meterId: string | null) {
 const {data, error} = await db.rpc("get_utility_meter_photos", {p_account_id: accountId, p_meter_id: meterId});
 if (error || !data) throw Error("Meter photos unavailable");
 const {period, revision, utilityAccounts} = data as {period: string; revision: number; utilityAccounts: UtilityAccount[]};
 return utilityPhotoData({utilityPeriod: period, utilityAccounts}, revision);
}
