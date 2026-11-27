import {prerenderToNodeStream} from "react-dom/static";
import {PassThrough} from "node:stream";
import {renderToPipeableStream} from "react-dom/server";
import {beforeEach,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),db:vi.fn(),sign:vi.fn(),queries:[] as {table:string;fields:string}[]}));
vi.mock("@/lib/auth",()=>({requireRole:mocks.auth}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.db}));
vi.mock("@/lib/membership",()=>({membershipEnabled:()=>true,malaysiaDay:()=>"2026-10-21"}));
vi.mock("@/components/logout-form",()=>({LogoutForm:()=> <button>Sign out</button>}));
vi.mock("next/link",()=>({default:({href,children,...props}:{href:string;children:React.ReactNode})=><a data-client-transition="true" href={href} {...props}>{children}</a>}));
import GymPage from "./page";
const member={email:"member@example.test",member_type:"resident",id_type:"Passport",identification:"TEST123",gender:"Male",nationality:"Malaysia",room_no:"B111",address:"B111",member_number:null,emergency_contact:"0123456789",emergency_relationship:"Father",created_at:"2026-10-20T10:00:00Z",access_card_path:"test/card.jpg",id:"10000000-0000-4000-8000-000000000001",full_name:"Test Member",student_id:"ST123",status:"active",expires_on:"2026-10-31",photo_path:"test/photo.jpg"};
beforeEach(()=>{
 vi.clearAllMocks();mocks.queries=[];
 mocks.sign.mockImplementation(async (bucket, paths: string[]) => ({data: paths.map(path => ({path,signedUrl:"https://example.test/"+bucket+"/"+path}))}));
 mocks.auth.mockResolvedValue({id:"patrol",full_name:"Gym Helper",role:"gym_patrol"});
 mocks.db.mockReturnValue({from:(table:string)=>{
  let head=false;
  const builder={select:(fields:string,options?:{head?:boolean})=>{mocks.queries.push({table,fields});head=Boolean(options?.head);return builder;},eq:()=>builder,neq:()=>builder,in:()=>builder,gte:()=>builder,lt:()=>builder,or:()=>builder,order:()=>builder,range:()=>builder,limit:()=>builder,maybeSingle:()=>Promise.resolve({data:table==="membership_activity"?{created_at:"2026-10-20T10:00:00Z",details:{version:"v1",clauses:["Rule one","Rule two"]}}:member,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:head?null:table==="memberships"?[member]:table==="membership_payments"?[{id:"receipt",kind:"registration",period_start:"2026-10-01",amount:40,status:"approved",receipt_path:"test/receipt.pdf",created_at:"2026-10-20T10:00:00Z",reviewed_at:"2026-10-21T10:00:00Z"}]:[],count:1,error:null}).then(resolve)};
  return builder;
 },storage:{from:(bucket:string)=>({createSignedUrls:(paths:string[],ttl:number)=>mocks.sign(bucket,paths,ttl)})}});
});
it("shows member photos and payments with full registration fields while keeping management controls unavailable",async()=>{
 const {prelude}=await prerenderToNodeStream(await GymPage({searchParams:Promise.resolve({id:member.id})}));
 const buffers:Buffer[]=[];for await(const chunk of prelude)buffers.push(Buffer.from(chunk));
 const html=Buffer.concat(buffers).toString().replaceAll('<!-- -->','');
 expect(html).not.toContain("data-client-transition");
 expect(mocks.sign).toHaveBeenCalledWith("membership-photos",["test/photo.jpg","test/card.jpg"],300);
 expect(mocks.sign).toHaveBeenCalledWith("membership-receipts",["test/receipt.pdf"],300);
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

it("renders searchable members while signing private photos in one batch for the list",async()=>{
 const gate=Promise.withResolvers<{data:[]}>();
 mocks.sign.mockReturnValue(gate.promise);
 const page=await GymPage({searchParams:Promise.resolve({})});
 let html='';
 const output=new PassThrough();
 output.setEncoding('utf8').on('data',chunk=>{html+=chunk;});
 const completed=new Promise<void>((resolve,reject)=>{
  output.on('end',resolve).on('error',reject);
  const stream=renderToPipeableStream(<html><body>{page}</body></html>,{onShellReady:()=>stream.pipe(output),onError:reject});
 });
 try{
  await vi.waitFor(()=>expect(html).toContain(member.student_id));
  expect(html).toContain('Find a member');
  expect(mocks.queries.filter(q=>q.table==='memberships')).toHaveLength(3);
  expect(mocks.sign).toHaveBeenCalledOnce();
 } finally {gate.resolve({data:[]});await completed;}
});
