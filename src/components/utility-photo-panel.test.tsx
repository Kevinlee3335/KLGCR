import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {UtilityPhotoPanel} from './utility-photo-panel';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()});
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
