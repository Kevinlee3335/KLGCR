export type BillingDocumentKind='rental'|'utility';
export type BillingDocumentRecord={run_id:string;line_index:number;kind:BillingDocumentKind;period:string;issue_date:string;created_at:string;account_key:string;account_name:string;bill_no:string;amount:number;description:string;approved_at:string|null;approved_by:string|null};
export type BillingAccountDirectory={kind:BillingDocumentKind;account_key:string;account_name:string;detail:string};
export type BillingDocumentFolder={key:string;name:string;detail:string;count:number;approved:number;latestPeriod:string;aliases:string[]};
export function isBillingDocumentKind(kind:string):kind is BillingDocumentKind{return kind==='rental'||kind==='utility'}
export function billingKindTitle(kind:BillingDocumentKind){return kind==='rental'?'Rental':'Utilities'}
export function billingFolderUrl(kind:BillingDocumentKind,key?:string){return '/documents/billing/'+kind+(key?'/account-'+encodeURIComponent(key):'')}
export function billingDocumentUrl(doc:Pick<BillingDocumentRecord,'run_id'|'line_index'>,download=false){return `/api/billing-documents/${encodeURIComponent(doc.run_id)}/${doc.line_index}${download?'?download=1':''}`}
export function billingDocumentFolders(kind:BillingDocumentKind,directory:BillingAccountDirectory[],docs:BillingDocumentRecord[]){
 const folders=new Map<string,BillingDocumentFolder>();
 for(const a of directory.filter(a=>a.kind===kind))folders.set(a.account_key,{key:a.account_key,name:a.account_name,detail:a.detail,count:0,approved:0,latestPeriod:'',aliases:[]});
 for(const d of [...docs].filter(d=>d.kind===kind).sort((a,b)=>b.created_at.localeCompare(a.created_at))){
  let folder=folders.get(d.account_key);if(!folder){folder={key:d.account_key,name:d.account_name,detail:'',count:0,approved:0,latestPeriod:'',aliases:[]};folders.set(d.account_key,folder)}
  folder.count++;if(d.approved_at)folder.approved++;if(d.period>folder.latestPeriod)folder.latestPeriod=d.period;
  if(!folder.aliases.includes(d.account_name))folder.aliases.push(d.account_name);
 }
 return [...folders.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.key.localeCompare(b.key));
}
export function billingFolderMatches(folder:BillingDocumentFolder,query:string){const text=[folder.name,folder.detail,...folder.aliases].join(' ').toLowerCase();return query.trim().toLowerCase().split(/\s+/).every(term=>text.includes(term))}
