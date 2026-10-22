import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),db:vi.fn(),queries:[] as {table:string;fields:string}[]}));
vi.mock("@/lib/auth",()=>({requireRole:mocks.auth}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.db}));
vi.mock("@/lib/membership",()=>({membershipEnabled:()=>true,malaysiaDay:()=>"2026-10-21"}));
vi.mock("@/components/logout-form",()=>({LogoutForm:()=> <button>Sign out</button>}));
vi.mock("next/link",()=>({default:({href,children,...props}:{href:string;children:React.ReactNode})=><a href={href} {...props}>{children}</a>}));
import GymPage from "./page";
const member={email:"member@example.test",member_type:"resident",id_type:"Passport",identification:"TEST123",gender:"Male",nationality:"Malaysia",room_no:"B111",address:"B111",member_number:null,emergency_contact:"0123456789",emergency_relationship:"Father",created_at:"2026-10-20T10:00:00Z",access_card_path:"test/card.jpg",id:"10000000-0000-4000-8000-000000000001",full_name:"Test Member",student_id:"ST123",status:"active",expires_on:"2026-10-31",photo_path:"test/photo.jpg"};
beforeEach(()=>{
 vi.clearAllMocks();mocks.queries=[];
 mocks.auth.mockResolvedValue({id:"patrol",full_name:"Gym Helper",role:"gym_patrol"});
 mocks.db.mockReturnValue({from:(table:string)=>{
  let head=false;
  const builder={select:(fields:string,options?:{head?:boolean})=>{mocks.queries.push({table,fields});head=Boolean(options?.head);return builder;},eq:()=>builder,neq:()=>builder,in:()=>builder,gte:()=>builder,lt:()=>builder,or:()=>builder,order:()=>builder,range:()=>builder,limit:()=>builder,maybeSingle:()=>Promise.resolve({data:table==="membership_activity"?{created_at:"2026-10-20T10:00:00Z",details:{version:"v1",clauses:["Rule one","Rule two"]}}:member,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:head?null:table==="memberships"?[member]:table==="membership_payments"?[{id:"receipt",kind:"registration",period_start:"2026-10-01",amount:40,status:"approved",receipt_path:"test/receipt.pdf",created_at:"2026-10-20T10:00:00Z",reviewed_at:"2026-10-21T10:00:00Z"}]:[],count:1,error:null}).then(resolve)};
  return builder;
 },storage:{from:(bucket:string)=>({createSignedUrl:async()=>({data:{signedUrl:"https://example.test/"+bucket}})})}});
});
it("shows member photos and payments with full registration fields while keeping management controls unavailable",async()=>{
 const html=renderToStaticMarkup(await GymPage({searchParams:Promise.resolve({id:member.id})}));
 expect(mocks.auth).toHaveBeenCalledWith(["gym_patrol","admin"]);
 for(const text of ["Test Member","ST123","Payment records","Approved","RM40.00","View receipt","membership-photos","member@example.test","TEST123","B111","0123456789","Father","Access Card photo","Rule one"]) expect(html).toContain(text);
 for(const text of ["Approve payment","Save status","Review note","/admin/complaints","/admin/users"]) expect(html).not.toContain(text);
 for(const query of mocks.queries) expect(query.fields).not.toMatch(/token|review_note/);
});
it("does not access member records before authorization succeeds",async()=>{
 mocks.auth.mockRejectedValue(new Error("Denied"));
 await expect(GymPage({searchParams:Promise.resolve({})})).rejects.toThrow("Denied");
 expect(mocks.db).not.toHaveBeenCalled();
});
