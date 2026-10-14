import type {UtilityAccount} from './billing-preview';
type Meter=UtilityAccount['meters'][number];
export function applyNewMeterPhoto(m:Meter,photo:string,date:string):Meter {
 const carry=m.confirmed&&m.curr!==null;
 return {...m,...(carry?{prev:m.curr,previousPhoto:m.photo,previousDate:m.currentDate}:{}),photo,currentDate:date,curr:null,confirmed:false};
}
