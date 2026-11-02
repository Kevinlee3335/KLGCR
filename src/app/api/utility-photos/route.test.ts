vi.mock("@/lib/utility-months",()=>({ensureUtilityMonth:vi.fn().mockResolvedValue(undefined)}));
import {beforeEach,describe,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
import {defaultBillingConfig,type BillingConfig} from "@/lib/billing-preview";
import {UTILITY_PHOTO_STAFF_ID} from "@/lib/utility-photo-access";
const mocks=vi.hoisted(()=>({profile:vi.fn(),admin:vi.fn(),ocr:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionProfile:mocks.profile}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
vi.mock("@/lib/meter-ocr-server",()=>({readMeterPhoto:mocks.ocr}));
import {GET,POST} from "./route";
const meter:BillingConfig['utilityAccounts'][number]['meters'][number]={id:"electric",label:"Electric",serial:"E1",unit:"kWh",role:"charge",rate:.6,prev:10,curr:20,confirmed:true};
let history:Map<number,BillingConfig>;let concurrentWrite:boolean;
let stored:{config:BillingConfig;revision:number;updated_by?:string};
beforeEach(()=>{mocks.ocr.mockReset();mocks.ocr.mockResolvedValue({reading:null,confidence:"low",note:"Unclear"});stored={config:{...defaultBillingConfig,utilityAccounts:[{id:"a",seq:1,name:"Account",addr:[],title:"",subsidy:0,cap:null,kind:"invoice",meters:[{...meter}]}]},revision:2};history=new Map([[2,structuredClone(stored.config)]]);concurrentWrite=false;mocks.profile.mockResolvedValue({id:UTILITY_PHOTO_STAFF_ID,username:"faiz",full_name:"Faiz",role:"maintenance_staff",is_active:true});mocks.admin.mockImplementation(()=>{
 return {from:(table:string)=>{
  let patch:Partial<typeof stored>={};let expected:number|undefined;
  const chain={
   select:()=>chain,
   eq:(key:string,value:unknown)=>{if(key==="revision")expected=value as number;return chain},
   single:async()=>table==="utility_reading_revisions"?{data:history.has(expected!)?{config:structuredClone(history.get(expected!))}:null,error:history.has(expected!)?null:{code:"PGRST116"}}:{data:structuredClone(stored),error:null},
   update:(value:Partial<typeof stored>)=>{patch=value;return chain},
   maybeSingle:async()=>{if(concurrentWrite){concurrentWrite=false;stored.config.utilityAccounts[0].title="Concurrent admin title";stored.revision++;history.set(stored.revision,structuredClone(stored.config));return {data:null,error:null}}if(expected!==stored.revision)return {data:null,error:null};stored={...stored,...patch};history.set(stored.revision,structuredClone(stored.config));return {data:{revision:stored.revision},error:null}}
  };
  return chain;
 }};
});});
function post(patch={}){return new NextRequest("https://example.com/api/utility-photos",{method:"POST",headers:{origin:"https://example.com","content-type":"application/json"},body:JSON.stringify({period:stored.config.utilityPeriod,revision:stored.revision,accountId:"a",meterId:"electric",photo:"data:image/jpeg;base64,YQ==",...patch})})}
describe("Utilities photo API",()=>{
 it("merges an old-revision upload while preserving unrelated Admin changes",async()=>{stored.config.utilityAccounts[0].name="Admin changed account name";stored.revision=3;const response=await POST(post({revision:2}));expect(response.status).toBe(200);expect(stored.config.utilityAccounts[0].name).toBe("Admin changed account name");expect(stored.config.utilityAccounts[0].meters[0].photo).toBe("data:image/jpeg;base64,YQ==");expect(stored.revision).toBe(4)});
 it("rejects stale uploads when Admin changed the target meter reading",async()=>{stored.config.utilityAccounts[0].meters[0].curr=25;stored.revision=3;expect((await POST(post({revision:2}))).status).toBe(409);expect(stored.config.utilityAccounts[0].meters[0].curr).toBe(25);expect(stored.revision).toBe(3)});
 it("retries a compare-and-swap race while preserving the concurrent edit",async()=>{concurrentWrite=true;expect((await POST(post())).status).toBe(200);expect(stored.config.utilityAccounts[0].title).toBe("Concurrent admin title");expect(stored.revision).toBe(4)});
 it("rejects a stale upload from a previous billing month",async()=>{stored.config.utilityPeriod="2026-11";stored.revision=3;expect((await POST(post({period:"2026-10",revision:2}))).status).toBe(409);expect(stored.revision).toBe(3)});
 it("persists photos and returns them when reopening, without rental or rates",async()=>{expect((await POST(post())).status).toBe(200);const list=await (await GET(new NextRequest("https://example.com/api/utility-photos"))).json();expect(list.accounts[0].meters[0]).not.toHaveProperty("photo");const result=await (await GET(new NextRequest("https://example.com/api/utility-photos?account=a"))).json();expect(result.accounts[0].meters[0].photo).toBe("data:image/jpeg;base64,YQ==");expect(result.accounts[0].meters[0].curr).toBeNull();expect(result).not.toHaveProperty("config");expect(result.accounts[0].meters[0]).not.toHaveProperty("rate");expect(stored.updated_by).toBe(UTILITY_PHOTO_STAFF_ID)});
 it("automatically reads uploads for each affected company, saves the suggestion and reopens it",async()=>{
  for(const [accountId,meterId] of [["medicassemblage","medi-elec"],["flextronics","utm-pe45"],["utm","utm-pe46"]]){
   stored.config.utilityAccounts[0].id=accountId;stored.config.utilityAccounts[0].meters[0].id=meterId;
   mocks.ocr.mockImplementationOnce(async()=>{expect(stored.config.utilityAccounts[0].meters[0].photo).toBe("data:image/jpeg;base64,YQ==");return {reading:2028100,confidence:"high",note:"converted"}});
   const result=await(await POST(post({accountId,meterId}))).json();
   expect(result.message).toContain("2028100");expect(result.accounts[0].meters[0].curr).toBe(2028100);expect(result.accounts[0].meters[0].confirmed).toBe(false);
   expect(mocks.ocr).toHaveBeenLastCalledWith(expect.objectContaining({meterId,unit:"kWh"}),UTILITY_PHOTO_STAFF_ID);
   const reopened=await(await GET(new NextRequest("https://example.com/api/utility-photos?account="+accountId))).json();expect(reopened.accounts[0].meters[0].curr).toBe(2028100);
  }
 });
 it("keeps the saved photo when AI is unavailable",async()=>{mocks.ocr.mockRejectedValue(Error("Budget"));const result=await(await POST(post())).json();expect(result.message).toContain("unavailable");expect(stored.config.utilityAccounts[0].meters[0].photo).toBeTruthy();expect(stored.config.utilityAccounts[0].meters[0].curr).toBeNull()});
 it("does not overwrite manual readings while AI is running",async()=>{mocks.ocr.mockImplementation(async()=>{stored.config.utilityAccounts[0].meters[0].curr=45;stored.config.utilityAccounts[0].meters[0].confirmed=true;stored.revision++;return {reading:55,confidence:"high",note:""}});const result=await(await POST(post())).json();expect(result.message).toContain("newer meter update");expect(stored.config.utilityAccounts[0].meters[0].curr).toBe(45);expect(stored.config.utilityAccounts[0].meters[0].confirmed).toBe(true)});
 it("merges unrelated writes and never changes another company's identical meter ID",async()=>{stored.config.utilityAccounts.push({...structuredClone(stored.config.utilityAccounts[0]),id:"other"});mocks.ocr.mockImplementation(async()=>{stored.config.utilityAccounts[1].title="Admin edit";stored.revision++;return {reading:55,confidence:"high",note:""}});expect((await POST(post())).status).toBe(200);expect(stored.config.utilityAccounts[0].meters[0].curr).toBe(55);expect(stored.config.utilityAccounts[1].meters[0].curr).toBe(20);expect(stored.config.utilityAccounts[1].title).toBe("Admin edit")});
 it("rejects low confidence and backwards readings without losing photos",async()=>{for(const value of [{reading:30,confidence:"low",note:""},{reading:5,confidence:"high",note:""}]){mocks.ocr.mockResolvedValueOnce(value);const result=await(await POST(post())).json();expect(result.message).toContain("reliable reading");expect(stored.config.utilityAccounts[0].meters[0].curr).toBeNull();expect(stored.config.utilityAccounts[0].meters[0].photo).toBeTruthy()}});
 it("discards a late AI result after month rollover",async()=>{mocks.ocr.mockImplementation(async()=>{stored.config.utilityPeriod="2027-01";stored.revision++;return {reading:55,confidence:"high",note:""}});const result=await(await POST(post())).json();expect(result.message).toContain("newer meter update");expect(stored.config.utilityAccounts[0].meters[0].curr).toBeNull()});
 it("denies other staff, inactive accounts and anonymous requests",async()=>{for(const p of [null,{id:"other",role:"maintenance_staff",is_active:true},{id:UTILITY_PHOTO_STAFF_ID,role:"maintenance_staff",is_active:false}]){mocks.profile.mockResolvedValue(p);expect((await GET(new NextRequest("https://example.com/api/utility-photos"))).status).toBe(403);expect((await POST(post())).status).toBe(403)}});
 it("rejects stale revisions, extra settings and invalid origins",async()=>{expect((await POST(post({revision:1}))).status).toBe(409);expect((await POST(post({config:{rent:0}}))).status).toBe(400);const req=post();req.headers.set("origin","https://other.com");expect((await POST(req)).status).toBe(403);expect(stored.revision).toBe(2)});
});
