import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({update:vi.fn(),insert:vi.fn(),create:vi.fn(),single:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireRole:vi.fn().mockResolvedValue({id:"admin-id"})}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({
  auth:{admin:{createUser:mocks.create}},
  from:()=>{const query={update:mocks.update,insert:mocks.insert,select:()=>query,eq:()=>query,single:mocks.single,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({error:null}).then(resolve)};mocks.update.mockReturnValue(query);return query;}
})}));
import { createUser, updateUserRole } from "./actions";
beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","test-key");
  mocks.create.mockResolvedValue({data:{user:{id:"new-id"}},error:null});
  mocks.insert.mockResolvedValue({error:null});
});
it.each([["cleaner","Nancy","housekeeping"],["maintenance_staff","Worker","operation"],["admin","Nouril","admin"],["admin","Fikri","operation"],["admin","Kevin Lee","operation"],["management_viewer","Viewer","admin"]])("stores the department when creating %s/%s",async(role,fullName,category)=>{
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
