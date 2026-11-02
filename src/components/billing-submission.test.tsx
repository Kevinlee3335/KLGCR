import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {BillingPanel} from './billing-panel';
import {configSchema,defaultBillingConfig} from '@/lib/billing-preview';
import fixture from '@/lib/billing-preview-fixture.json';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('saves confirmed readings before submitting to Fikri, then shows the persistent review status',async()=>{
 const config=configSchema.parse({...defaultBillingConfig,...fixture});
 const state={config,photosLoaded:true,revision:4,runs:[],clock:{date:'2026-11-02',time:'17:00'}};
 const run={id:'new-pack',kind:'utility',period:config.utilityPeriod,issue_date:'2026-11-02',total:50,verifiedCount:0,snapshot:{kind:'utility',period:config.utilityPeriod,issueDate:'2026-11-02',total:50,lines:[],testMode:true,createdBy:'Kevin'}};
 const actions:unknown[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{
  if(!options?.body)return new Response(JSON.stringify({...state,revision:5,runs:[run]}));
  const body=JSON.parse(options.body);actions.push(body);
  return new Response(JSON.stringify(body.action==='save'?{revision:5}:{ok:true,id:run.id,snapshot:run.snapshot}));
 }));
 render(<BillingPanel initialData={state}/>);
 fireEvent.click(screen.getByRole('button',{name:'Utility readings'}));
 fireEvent.click(screen.getByRole('button',{name:'Submit to Fikri for Verification'}));
 await screen.findByText(/Submitted · Pending Fikri Verification/);
 expect(actions).toEqual([expect.objectContaining({action:'save',revision:4}),{action:'submit',kind:'utility',period:config.utilityPeriod}]);
 expect(screen.getByRole('link',{name:'Open review status'})).toHaveAttribute('href','/admin/document-review/billing/new-pack');
 expect(screen.getByText(/Invoice date:.*Pending Fikri Verification/)).toBeInTheDocument();
});
it.each([[0,'Pending Fikri Verification'],[1,'Pending Kevin Verification'],[2,'Pending James Approval']])('loads reviewer stage %i from saved data',async(count,label)=>{
 const config=configSchema.parse({...defaultBillingConfig,...fixture});
 render(<BillingPanel initialData={{config,revision:1,clock:{date:'2026-11-02',time:'17:00'},runs:[{id:'pack',kind:'utility',period:config.utilityPeriod,issue_date:'2026-11-02',total:0,verifiedCount:Number(count),snapshot:{kind:'utility',period:config.utilityPeriod,issueDate:'2026-11-02',lines:[],total:0,testMode:true,createdBy:'Kevin'}}]}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Invoice history'}));
 expect(screen.getByText(new RegExp('Invoice date:.*'+label))).toBeInTheDocument();
});
