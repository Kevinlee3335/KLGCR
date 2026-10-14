import { afterEach,beforeEach,describe,it,expect,vi } from "vitest";
import { render,screen,fireEvent,waitFor,cleanup } from "@testing-library/react";
import { BillingPanel } from "./billing-panel";
import { configSchema,defaultBillingConfig } from "@/lib/billing-preview";
import fixture from "@/lib/billing-preview-fixture.json";

describe('camera upload and automatic meter reading',()=>{
 const requests:{url:string;body:Record<string,unknown>}[]=[];
 let failOcr=false;
 beforeEach(()=>{
   requests.length=0;failOcr=false;
   vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:600,height:400,close:vi.fn()})));
   vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
   vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/jpeg;base64,YWJj');
   vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
     if(!options?.body)return new Response(JSON.stringify({config:configSchema.parse({...defaultBillingConfig,...fixture}),revision:0,runs:[],clock:{date:'2026-10-13',time:'09:00'}}));
     const body=JSON.parse(options.body as string);requests.push({url,body});
     if(url.endsWith('/ocr'))return new Response(JSON.stringify(failOcr?{error:'AI unavailable; enter manually.'}:{reading:71000,confidence:'high',note:'Clear digits'}),{status:failOcr?503:200});
     return new Response(JSON.stringify({ok:true,revision:Number(body.revision)+1}));
   }));
 });
 afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()});
 async function open(){render(<BillingPanel/>);await screen.findByRole('button',{name:'Utility readings'});fireEvent.click(screen.getByRole('button',{name:'Utility readings'}));return screen.getAllByLabelText('Camera photo for Meter 1')[0] as HTMLInputElement}
 it('offers rear camera separately from gallery and saves photo before OCR, then saves unconfirmed reading',async()=>{
   const camera=await open();expect(camera.getAttribute('capture')).toBe('environment');expect(screen.getAllByLabelText('Photo file for Meter 1')[0]).not.toHaveAttribute('capture');
   fireEvent.change(camera,{target:{files:[new File(['image'],'meter.jpg',{type:'image/jpeg'})]}});
   await screen.findByText(/suggested reading 71000 saved/);
   expect(requests.map(r=>r.url)).toEqual(['/api/billing-preview','/api/billing-preview/ocr','/api/billing-preview']);
   const saved=configSchema.parse(requests[0].body.config).utilityAccounts[0].meters[0];expect(saved.photo).toBe('data:image/jpeg;base64,YWJj');expect(saved.curr).toBeNull();expect(saved.confirmed).toBe(false);
   const result=configSchema.parse(requests[2].body.config).utilityAccounts[0].meters[0];expect(result.curr).toBe(71000);expect(result.confirmed).toBe(false);
 });
 it('saves a manually shortened reading and confirms the entered integer for invoices',async()=>{
   await open();const input=screen.getAllByLabelText('Current (whole digits only)')[0];fireEvent.change(input,{target:{value:'710009'}});fireEvent.change(input,{target:{value:'71000'}});expect(input).toHaveValue('71000');fireEvent.click(screen.getAllByRole('button',{name:'Save & confirm reading'})[0]);await screen.findByText(/Corrected reading saved and confirmed/);const meter=configSchema.parse(requests[0].body.config).utilityAccounts[0].meters[0];expect(meter.curr).toBe(71000);expect(meter.confirmed).toBe(true);
 });
 it('previews one account while another account has unconfirmed readings',async()=>{
   await open();const inputs=screen.getAllByLabelText('Current (whole digits only)');fireEvent.change(inputs[2],{target:{value:''}});fireEvent.click(screen.getAllByRole('button',{name:/^Preview invoice$/})[0]);await screen.findByTitle('Invoice document preview');expect(screen.getByTitle('Invoice document preview').getAttribute('srcDoc')).toContain('Sample account 1');expect(screen.getByTitle('Invoice document preview').getAttribute('srcDoc')).not.toContain('Sample account 2');
 });
 it('replaces the current photo without rolling the previous reading forward',async()=>{await open();const input=screen.getAllByLabelText('Replace current photo for Meter 1')[0];fireEvent.change(input,{target:{files:[new File(['replacement'],'wrong-photo-fixed.jpg',{type:'image/jpeg'})]}});await screen.findByText(/suggested reading 71000 saved/);const meter=configSchema.parse(requests[0].body.config).utilityAccounts[0].meters[0];expect(meter.prev).toBe(fixture.utilityAccounts[0].meters[0].prev);expect(meter.curr).toBeNull();expect(meter.confirmed).toBe(false)});
 it('replaces the previous photo and reads into Previous while preserving Current',async()=>{await open();const input=screen.getAllByLabelText('Replace previous photo for Meter 1')[0];fireEvent.change(input,{target:{files:[new File(['replacement'],'previous.jpg',{type:'image/jpeg'})]}});await screen.findByText(/suggested reading 71000 saved/);const meter=configSchema.parse(requests[2].body.config).utilityAccounts[0].meters[0];expect(meter.prev).toBe(71000);expect(meter.curr).toBe(fixture.utilityAccounts[0].meters[0].curr);expect(meter.confirmed).toBe(false)});
 it('retains the saved photo when OCR fails, without retaining an old reading',async()=>{
   failOcr=true;const camera=await open();fireEvent.change(camera,{target:{files:[new File(['image'],'meter.jpg',{type:'image/jpeg'})]}});
   await screen.findByText(/Photo is saved.*AI unavailable/);
   expect(requests).toHaveLength(2);expect(configSchema.parse(requests[0].body.config).utilityAccounts[0].meters[0].curr).toBeNull();
   await waitFor(()=>expect(screen.getAllByRole('button',{name:/Take photo for/})[0]).toBeEnabled());
 });
});
