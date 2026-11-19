import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({update:vi.fn(),insert:vi.fn(),create:vi.fn(),single:vi.fn(),password:vi.fn(),actor:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireRole:mocks.actor}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({
  auth:{admin:{createUser:mocks.create,updateUserById:mocks.password}},
  from:()=>{const query={update:mocks.update,insert:mocks.insert,select:()=>query,in:()=>Promise.resolve({data:[{id:1,code:"A"},{id:2,code:"B"},{id:3,code:"C"},{id:4,code:"D"}],error:null}),eq:()=>query,single:mocks.single,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({error:null}).then(resolve)};mocks.update.mockReturnValue(query);return query;}
})}));
import { createUser, updateUserRole, setUserPassword } from "./actions";
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({id:"admin-id",username:"admin",is_super_admin:false});
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","test-key");
  mocks.create.mockResolvedValue({data:{user:{id:"new-id"}},error:null});
  mocks.insert.mockResolvedValue({error:null});
});
it.each([["cleaner","Nancy","housekeeping"],["maintenance_staff","Worker","operation"],["admin","Nouril","admin"],["admin","Fikri","operation"],["admin","Kevin Lee","operation"],["management_viewer","Viewer","admin"],["gym_patrol","Gym Helper",null]])("stores the department when creating %s/%s",async(role,fullName,category)=>{
  const form=new FormData();
  Object.entries({role,fullName,username:"newuser",email:"new@example.test",password:"test-password-123"}).forEach(([key,value])=>form.set(key,value));
  expect(await createUser({},form)).toEqual({ok:`${fullName} can now sign in.`});
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({role,daily_task_category:category}));
});
it.each([[null,"housekeeping"],["operation","operation"]])("fills missing categories while preserving explicit overrides on role edits (%s)",async(category,expected)=>{
  mocks.single.mockResolvedValue({data:{role:"maintenance_staff",full_name:"Employee",daily_task_category:category},error:null});
  const form=new FormData();form.set("id","employee-id");form.set("role","cleaner");
  await updateUserRole(form);
  expect(mocks.update).toHaveBeenCalledWith({role:"cleaner",daily_task_category:expected});
});

it("creates a username-only account with a random internal Auth identity and empty contact email", async()=>{
 const form=new FormData();
 Object.entries({role:"gym_patrol",fullName:"Sport club community",username:"KLGSCC",email:"",password:"test-password-123"}).forEach(([k,v])=>form.set(k,v));
 expect(await createUser({},form)).toEqual({ok:"Sport club community can now sign in."});
 expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({email:expect.stringMatching(/@users\.klgcr\.invalid$/),email_confirm:true,user_metadata:expect.objectContaining({username:"klgscc",email_optional:true})}));
 expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({email:null,username:"klgscc",role:"gym_patrol"}));
});
it.each([false,true])("restricts username-only password resets to Super Admin (%s)",async(superAdmin)=>{
 mocks.actor.mockResolvedValue({id:"admin-id",username:superAdmin?"kevinlee3335":"admin",is_super_admin:superAdmin});
 mocks.single.mockResolvedValue({data:{email:null,is_super_admin:false},error:null});
 mocks.password.mockResolvedValue({error:null});
 const form=new FormData();form.set("id","target");form.set("password","new-password-123");
 const result=await setUserPassword(form);
 if(superAdmin){expect(result.ok).toBe("Password updated.");expect(mocks.password).toHaveBeenCalled();}
 else {expect(result.error).toContain("Only Super Admin");expect(mocks.password).not.toHaveBeenCalled();}
});

it("preserves all four selected blocks for Gym Patrol",async()=>{
 const form=new FormData();
 Object.entries({role:"gym_patrol",fullName:"Sport club community",username:"KLGSCC",email:"",password:"test-password-123"}).forEach(([k,v])=>form.set(k,v));
 for(const block of ["A","B","C","D"])form.append("blocks",block);
 expect((await createUser({},form)).ok).toBeTruthy();
 expect(mocks.insert).toHaveBeenCalledWith([1,2,3,4].map(id=>({profile_id:"new-id",block_id:id})));
});
