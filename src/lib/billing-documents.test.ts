import {it,expect} from 'vitest';
import {billingDocumentFolders,billingFolderMatches,billingFolderUrl,billingDocumentUrl,type BillingDocumentRecord} from './billing-documents';
const doc=(key:string,name:string,kind:'rental'|'utility'='rental',period='2026-10'):BillingDocumentRecord=>({run_id:'run',line_index:0,kind,period,issue_date:period+'-01',created_at:period+'-01T00:00:00Z',account_key:key,account_name:name,bill_no:'INV-1',amount:100,description:'Rental bill',approved_at:null,approved_by:null});
it('creates current tenant folders before any invoice is saved',()=>{expect(billingDocumentFolders('rental',[{kind:'rental',account_key:'1',account_name:'Tenant A',detail:'Lot A'}],[])).toMatchObject([{key:'1',name:'Tenant A',count:0}])});
it('keeps all months and historical tenants, separates same-name accounts and never mixes rental with utilities',()=>{
 const rows=[doc('1','Tenant A'),{...doc('1','Old Tenant A','rental','2026-09'),approved_at:'2026-10-01T00:00:00Z'},doc('2','Tenant A'),doc('removed','Past tenant'),doc('1','Utility account','utility')];
 const folders=billingDocumentFolders('rental',[{kind:'rental',account_key:'1',account_name:'Renamed Tenant A',detail:'Lot A'}],rows);
 expect(folders).toHaveLength(3);expect(folders.find(f=>f.key==='1')).toMatchObject({name:'Renamed Tenant A',count:2,approved:1,latestPeriod:'2026-10'});expect(folders.find(f=>f.key==='2')?.count).toBe(1);expect(folders.find(f=>f.key==='removed')?.name).toBe('Past tenant');expect(billingFolderMatches(folders.find(f=>f.key==='1')!,'Old Tenant')).toBe(true);
});
it('builds safe tenant folder and exact individual invoice links',()=>{expect(billingFolderUrl('rental','A/B & C')).toBe('/documents/billing/rental/account-A%2FB%20%26%20C');expect(billingDocumentUrl({run_id:'id',line_index:2},true)).toBe('/api/billing-documents/id/2?download=1')});

it('does not let a dot-like account key navigate out of its archive folder',()=>{expect(new URL(billingFolderUrl('utility','..'),'https://example.test').pathname).toBe('/documents/billing/utility/account-..')});
