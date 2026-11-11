import type {BillingConfig,UtilityAccount} from './billing-preview';
type Meter=UtilityAccount['meters'][number];
export function applyNewMeterPhoto(m:Meter,photo:string,date:string):Meter {
 // Monthly carry-forward is atomic on the server. A retake only replaces
 // the current image and must never shift the previous month's evidence.
 return {...m,photo,currentDate:date,curr:null,confirmed:false};
}

export type BillingMeterPhotoTarget = {
 accountId: string;
 meterId: string;
 side: "photo" | "previousPhoto";
};

export function stripBillingMeterPhotos(config: BillingConfig, keep?: BillingMeterPhotoTarget): BillingConfig {
 return {
  ...config,
  utilityAccounts: config.utilityAccounts.map(account => ({
   ...account,
   meters: account.meters.map(meter => {
    const side = account.id === keep?.accountId && meter.id === keep.meterId ? keep.side : undefined;
    const copy = { ...meter };
    if (side !== "photo") delete copy.photo;
    if (side !== "previousPhoto") delete copy.previousPhoto;
    return copy;
   }),
  })),
 };
}
