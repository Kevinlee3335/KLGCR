import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {BillingPanel} from './billing-panel';
import {configSchema,defaultBillingConfig} from '@/lib/billing-preview';
import fixture from '@/lib/billing-preview-fixture.json';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
const financeResponse=()=>new Response(JSON.stringify({accounts:[],message:'Connected'}));
it('saves confirmed readings before submitting to Fikri, then shows the persistent review status',async()=>{
 const config=configSchema.parse({...defaultBillingConfig,...fixture});
 const state={config,photosLoaded:true,revision:4,pendingPackCount:0,clock:{date:'2026-11-02',time:'17:00'}};
 const run={id:'new-pack',kind:'utility',period:config.utilityPeriod,issue_date:'2026-11-02',total:50,verifiedCount:0,approved:false,mail:null,snapshot:{kind:'utility',period:config.utilityPeriod,issueDate:'2026-11-02',total:50,lines:[],testMode:true,createdBy:'Kevin'}};
 const actions:unknown[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
  if(url.startsWith('/api/finance'))return financeResponse();
  if(!options?.body){
   const view=new URL(url,"https://example.test").searchParams.get("view");
   return new Response(JSON.stringify(view==="history"?{runs:[run]}:{...state,revision:5}));
  }
  const body=JSON.parse(String(options.body));actions.push(body);
  return new Response(JSON.stringify(body.action==='save'?{revision:5}:{ok:true,id:run.id,snapshot:run.snapshot}));
 }));
 render(<BillingPanel initialData={state}/>);
 fireEvent.click(screen.getByRole('button',{name:'Utility readings'}));
 fireEvent.click(screen.getByRole('button',{name:'Submit to Fikri for Verification'}));
 await screen.findByText(/Submitted · Pending Fikri Verification/);
 expect(actions).toEqual([expect.objectContaining({action:'save',revision:4}),{action:'submit',kind:'utility',period:config.utilityPeriod}]);
 expect(await screen.findByRole('link',{name:'Open review status'})).toHaveAttribute('href','/admin/document-review/billing/new-pack');
 expect(screen.getByText(/Invoice date:.*Pending Fikri Verification/)).toBeInTheDocument();
});
it.each([[0,'Pending Fikri Verification'],[1,'Pending Kevin Verification'],[2,'Pending James Approval']])('loads reviewer stage %i from saved data',async(count,label)=>{
 const config=configSchema.parse({...defaultBillingConfig,...fixture});
 const run={id:'pack',kind:'utility',period:config.utilityPeriod,issue_date:'2026-11-02',total:0,verifiedCount:Number(count),approved:false,mail:null};
 const fetcher=vi.fn(async(url:string)=>url.startsWith('/api/finance')?financeResponse():new Response(JSON.stringify({runs:[run]})));
 vi.stubGlobal("fetch",fetcher);
 render(<BillingPanel initialData={{config,revision:1,pendingPackCount:0,clock:{date:'2026-11-02',time:'17:00'}}}/>);
 expect(fetcher).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Invoice history'}));
 expect(await screen.findByText(new RegExp('Invoice date:.*'+label))).toBeInTheDocument();
 expect(fetcher).toHaveBeenCalledWith('/api/billing-preview?view=history',expect.anything());
});
it('reads a complete saved invoice only when opening the pack',async()=>{
 const config=configSchema.parse({...defaultBillingConfig,...fixture});
 const run={id:'pack',kind:'rental',period:'2026-11',issue_date:'2026-11-03',total:55,verifiedCount:2,approved:true,mail:null};
 const snapshot={kind:'rental',period:'2026-11',issueDate:'2026-11-03',total:55,testMode:true,createdBy:'Kevin',
  lines:[{name:'Saved rental tenant',billNo:'KLG-11',amount:55,description:'Saved rental',addr:[]}]};
 const fetcher=vi.fn(async(url:string)=>url.startsWith('/api/finance')?financeResponse():new Response(JSON.stringify(url.endsWith('view=history')?{runs:[run]}:{pack:{...run,snapshot}})));
 vi.stubGlobal('fetch',fetcher);
 render(<BillingPanel initialData={{config,revision:1,pendingPackCount:0,photosLoaded:false,clock:{date:'2026-11-02',time:'17:00'}}}/>);
 expect(fetcher).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Invoice history'}));
 const view=await screen.findByRole('button',{name:'View pack'});
 expect(fetcher.mock.calls.filter(([url])=>url.startsWith('/api/billing-preview?view=')).map(([url])=>url)).toEqual(['/api/billing-preview?view=history']);
 fireEvent.click(view);
 expect(await screen.findByText('Saved rental tenant')).toBeInTheDocument();
 expect(screen.getByText('Issue date: 2026-11-03 · Approved by James')).toBeInTheDocument();
 expect(fetcher).toHaveBeenCalledWith('/api/billing-preview?view=pack&id=pack',expect.anything());
});
