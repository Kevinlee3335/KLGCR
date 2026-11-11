import type {Profile} from "./types";
import {orderedUtilityAccounts} from "./billing-account-order";
import {utilityAccountEligible, type BillingConfig, type UtilityAccount} from "./billing-preview";

export const UTILITY_PHOTO_STAFF_ID = "595974ab-c1c2-4c85-8742-2baef04b459b";

export function canCaptureUtilityPhotos(profile: Profile | null) {
 return !!profile?.is_active && (profile.role === "admin" || (profile.role === "maintenance_staff" && profile.id === UTILITY_PHOTO_STAFF_ID));
}

export function utilityMeterPhotoData(meter: UtilityAccount["meters"][number]) {
 const {id, label, serial, unit, role, readingDigits, confirmed, prev, curr, previousDate, currentDate, previousPhoto, photo} = meter;
 return {id, label, serial, unit, role, readingDigits, confirmed, prev, curr, previousDate, currentDate, previousPhoto, photo};
}

export function utilityPhotoData(config: Pick<BillingConfig, "utilityPeriod" | "utilityAccounts">, revision: number) {
 return {
  period: config.utilityPeriod,
  revision,
  accounts: orderedUtilityAccounts(config.utilityAccounts)
   .filter(account => utilityAccountEligible(account, config.utilityPeriod))
   .map(({id, name, meters}) => ({id, name, meters: meters.map(utilityMeterPhotoData)})),
 };
}

export type UtilityPhotoData = ReturnType<typeof utilityPhotoData>;
export type UtilityMeterPhotoData = ReturnType<typeof utilityMeterPhotoData>;
export type UtilityPhotoProgress = {
 status: "pending" | "read" | "manual" | "unavailable" | "superseded";
 revision?: number;
 reading?: number | null;
 meter?: UtilityMeterPhotoData;
 replacePhotos?: boolean;
 message?: string;
};
export type UtilityPhotoCapture = {
 period: string;
 revision: number;
 accountId: string;
 meter: UtilityMeterPhotoData;
 readingPending?: boolean;
 readingId?: string;
 message: string;
};
