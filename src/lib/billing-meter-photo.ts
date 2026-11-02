import type {UtilityAccount} from './billing-preview';
type Meter=UtilityAccount['meters'][number];
export function applyNewMeterPhoto(m:Meter,photo:string,date:string):Meter {
 // Monthly carry-forward is atomic on the server. A retake only replaces
 // the current image and must never shift the previous month's evidence.
 return {...m,photo,currentDate:date,curr:null,confirmed:false};
}
