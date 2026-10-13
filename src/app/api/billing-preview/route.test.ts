import { beforeEach,describe,it,expect,vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({profile:null as null|{id:string;role:string;full_name:string},db:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionProfile:async()=>mocks.profile}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.db}));
import { GET,POST } from './route';
describe('billing preview authorization',()=>{
 beforeEach(()=>{vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','feature/rental-utility-billing-test');mocks.profile=null;mocks.db.mockClear()});
 it.each([null,'cleaner','maintenance_staff'])('denies profile %s before database access',async role=>{mocks.profile=role?{id:'test',role,full_name:'Test'}:null;expect((await GET()).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()});
 it('disables the API in production',async()=>{vi.stubEnv('VERCEL_ENV','production');mocks.profile={id:'test',role:'admin',full_name:'Test'};expect((await GET()).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()});
 it.each(['admin','management_viewer'])('rejects cross-origin writes for %s',async role=>{mocks.profile={id:'test',role,full_name:'Test'};const req=new NextRequest('https://example.test/api/billing-preview',{method:'POST',headers:{origin:'https://other.test'},body:'{}'});expect((await POST(req)).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()});
});
