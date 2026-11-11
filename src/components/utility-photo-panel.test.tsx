import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,act} from '@testing-library/react';
import {UtilityPhotoPanel} from './utility-photo-panel';
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()});
it('Faiz upload automatically shows and reopens the persisted AI suggestion',async()=>{
 const meter={id:'medi-elec',label:'Electric',serial:'E1',unit:'kWh',role:'charge',prev:100,curr:null as number|null,confirmed:false};
 const data={period:'2026-11',revision:5,accounts:[{id:'medicassemblage',name:'MEDICASSEMBLAGE SDN BHD',meters:[meter]}]};
 vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:600,height:400,close:vi.fn()})));
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/jpeg;base64,YQ==');
 vi.stubGlobal('fetch',vi.fn(async(_url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){expect(JSON.parse(options.body as string)).toMatchObject({accountId:'medicassemblage',meterId:'medi-elec',revision:5});meter.curr=150;data.revision=7;return new Response(JSON.stringify({...data,message:'Photo and suggested reading 150 saved. Admin must check and confirm.'}))}
  return new Response(JSON.stringify(data));
 }));
 render(<UtilityPhotoPanel/>);await screen.findByRole('heading',{name:'MEDICASSEMBLAGE SDN BHD'});fireEvent.click(screen.getByRole('button',{name:'Open readings'}));await screen.findByLabelText('Current (whole digits only)');
 fireEvent.change(screen.getByLabelText('Camera photo for MEDICASSEMBLAGE SDN BHD · Electric'),{target:{files:[new File(['image'],'meter.jpg',{type:'image/jpeg'})]}});
 await screen.findByText(/suggested reading 150 saved/);expect(screen.getByLabelText('Current (whole digits only)')).toHaveValue('150');
 fireEvent.click(screen.getByRole('button',{name:'Reload readings'}));expect(await screen.findByLabelText('Current (whole digits only)')).toHaveValue('150');
});

it("releases the camera after saving evidence and refreshes the reading when background OCR finishes",async()=>{
 vi.useFakeTimers();
 const photo="data:image/jpeg;base64,YQ==";
 const meter={id:"water",label:"Water",serial:"W1",unit:"m³",role:"charge",prev:100,curr:null as number|null,confirmed:false,photo:undefined as string|undefined};
 const data={period:"2026-11",revision:5,accounts:[{id:"unit",name:"Account",meters:[meter]}]};
 vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:600,height:400,close:vi.fn()})));
 vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,"toDataURL").mockReturnValue(photo);
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>{
  if(options?.method==="POST"){
   expect(new Headers(options.headers).get("prefer")).toBe("respond-async");
   meter.photo=photo;data.revision=6;
   return Response.json({...data,readingPending:true,message:"Photo saved. AI is reading the meter."},{status:202});
  }
  const includePhoto=url.includes("?account=");
  return Response.json({...data,accounts:[{...data.accounts[0],meters:[{...meter,photo:includePhoto?meter.photo:undefined}]}]});
 });
 vi.stubGlobal("fetch",fetcher);
 render(<UtilityPhotoPanel/>);
 await act(async()=>{});
 fireEvent.click(screen.getByRole("button",{name:"Open readings"}));
 await act(async()=>{});
 fireEvent.change(screen.getByLabelText("Camera photo for Account · Water"),{target:{files:[new File(["image"],"meter.jpg",{type:"image/jpeg"})]}});
 await act(async()=>{});

 expect(screen.getByText("Photo saved. AI is reading the meter.")).toBeInTheDocument();
 expect(screen.getByRole("button",{name:/Take photo for Account/})).toBeEnabled();
 expect(screen.getByLabelText("Current (whole digits only)")).toHaveValue("");
 expect(fetcher.mock.calls).toHaveLength(3);

 meter.curr=150;data.revision=7;
 await act(async()=>{await vi.advanceTimersByTimeAsync(8_000)});
 expect(fetcher.mock.calls.slice(3).map(([url])=>url)).toEqual(["/api/utility-photos","/api/utility-photos?account=unit"]);
 expect(screen.getByLabelText("Current (whole digits only)")).toHaveValue("150");
 expect(screen.queryByText("AI reading in progress")).not.toBeInTheDocument();
});
