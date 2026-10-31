import {beforeEach,describe,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
import {defaultBillingConfig,type BillingConfig} from "@/lib/billing-preview";
import {UTILITY_PHOTO_STAFF_ID} from "@/lib/utility-photo-access";
const mocks=vi.hoisted(()=>({profile:vi.fn(),admin:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionProfile:mocks.profile}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
import {GET,POST} from "./route";
const meter:BillingConfig['utilityAccounts'][number]['meters'][number]={id:"electric",label:"Electric",serial:"E1",unit:"kWh",role:"charge",rate:.6,prev:10,curr:20,confirmed:true};
let stored:{config:BillingConfig;revision:number;updated_by?:string};
beforeEach(()=>{stored={config:{...defaultBillingConfig,utilityAccounts:[{id:"a",seq:1,name:"Account",addr:[],title:"",subsidy:0,cap:null,kind:"invoice",meters:[{...meter}]}]},revision:2};mocks.profile.mockResolvedValue({id:UTILITY_PHOTO_STAFF_ID,username:"faiz",full_name:"Faiz",role:"maintenance_staff",is_active:true});mocks.admin.mockImplementation(()=>{
 return {from:()=>{
  let patch:Partial<typeof stored>={};let expected:number|undefined;
  const chain={
   select:()=>chain,
   eq:(key:string,value:unknown)=>{if(key==="revision")expected=value as number;return chain},
   single:async()=>({data:structuredClone(stored),error:null}),
   update:(value:Partial<typeof stored>)=>{patch=value;return chain},
   maybeSingle:async()=>{if(expected!==stored.revision)return {data:null,error:null};stored={...stored,...patch};return {data:{revision:stored.revision},error:null}}
  };
  return chain;
 }};
});});
function post(patch={}){return new NextRequest("https://example.com/api/utility-photos",{method:"POST",headers:{origin:"https://example.com","content-type":"application/json"},body:JSON.stringify({period:stored.config.utilityPeriod,revision:stored.revision,accountId:"a",meterId:"electric",photo:"data:image/jpeg;base64,YQ==",...patch})})}
describe("Utilities photo API",()=>{
 it("persists photos and returns them when reopening, without rental or rates",async()=>{expect((await POST(post())).status).toBe(200);const result=await (await GET()).json();expect(result.accounts[0].meters[0].photo).toBe("data:image/jpeg;base64,YQ==");expect(result.accounts[0].meters[0].curr).toBeNull();expect(result).not.toHaveProperty("config");expect(result.accounts[0].meters[0]).not.toHaveProperty("rate");expect(stored.updated_by).toBe(UTILITY_PHOTO_STAFF_ID)});
 it("denies other staff, inactive accounts and anonymous requests",async()=>{for(const p of [null,{id:"other",role:"maintenance_staff",is_active:true},{id:UTILITY_PHOTO_STAFF_ID,role:"maintenance_staff",is_active:false}]){mocks.profile.mockResolvedValue(p);expect((await GET()).status).toBe(403);expect((await POST(post())).status).toBe(403)}});
 it("rejects stale revisions, extra settings and invalid origins",async()=>{expect((await POST(post({revision:1}))).status).toBe(409);expect((await POST(post({config:{rent:0}}))).status).toBe(400);const req=post();req.headers.set("origin","https://other.com");expect((await POST(req)).status).toBe(403);expect(stored.revision).toBe(2)});
});
