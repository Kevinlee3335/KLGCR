export type PODraftLine = {itemId:string;quantity:number};
const key=(store:string)=>`klgcr-po-draft-v1:${store}`;
export function readPODraft(store:string):PODraftLine[]{
 try {const value:unknown=JSON.parse(localStorage.getItem(key(store))||'[]');return Array.isArray(value)?value.filter((line):line is PODraftLine=>!!line&&typeof line.itemId==='string'&&typeof line.quantity==='number'&&Number.isFinite(line.quantity)&&line.quantity>=0.01&&line.quantity<=1000000).slice(0,100):[];}catch{return [];}
}
export function writePODraft(store:string,lines:PODraftLine[]){localStorage.setItem(key(store),JSON.stringify(lines));localStorage.setItem('klgcr-po-draft-active-v1',store);}
export function activePODraftStore(){try{const value=localStorage.getItem('klgcr-po-draft-active-v1');return value&&['building','office','cleaner'].includes(value)?value:'building';}catch{return 'building';}}
