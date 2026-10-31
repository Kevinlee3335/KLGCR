import type {Profile} from "./types";
import {orderedUtilityAccounts} from "./billing-account-order";
import {utilityAccountEligible,type BillingConfig} from "./billing-preview";
export const UTILITY_PHOTO_STAFF_ID="595974ab-c1c2-4c85-8742-2baef04b459b";
export function canCaptureUtilityPhotos(profile:Profile|null){return !!profile?.is_active&&(profile.role==="admin"||(profile.role==="maintenance_staff"&&profile.id===UTILITY_PHOTO_STAFF_ID))}
export function utilityPhotoData(config:BillingConfig,revision:number){return {period:config.utilityPeriod,revision,accounts:orderedUtilityAccounts(config.utilityAccounts).filter(a=>utilityAccountEligible(a,config.utilityPeriod)).map(a=>({id:a.id,name:a.name,meters:a.meters.map(m=>({id:m.id,label:m.label,serial:m.serial,unit:m.unit,prev:m.prev,curr:m.curr,previousDate:m.previousDate,currentDate:m.currentDate,previousPhoto:m.previousPhoto,photo:m.photo}))}))}}
export type UtilityPhotoData=ReturnType<typeof utilityPhotoData>;
export function replaceUtilityPhoto(config:BillingConfig,input:{period:string;accountId:string;meterId:string;photo:string},date:string):BillingConfig{
 if(input.period!==config.utilityPeriod)throw Error("Billing month changed. Reload before taking a photo.");
 const account=config.utilityAccounts.find(a=>a.id===input.accountId);
 if(!account||!utilityAccountEligible(account,config.utilityPeriod)||!account.meters.some(m=>m.id===input.meterId))throw Error("Meter not found.");
 return {...config,utilityAccounts:config.utilityAccounts.map(a=>a.id!==input.accountId?a:{...a,meters:a.meters.map(m=>m.id!==input.meterId?m:{...m,photo:input.photo,currentDate:date,curr:null,confirmed:false})})};
}
