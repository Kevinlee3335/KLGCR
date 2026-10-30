// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({paths:[] as string[],saved:null as unknown,missing:false}));
vi.mock('@/lib/waste/server',()=>({securityAccess:async()=>({id:'link',guard_name:'Test guard'})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({
 from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}),insert:async(value:unknown)=>{state.saved=value;return {error:null}}}),
 storage:{from:()=>({list:async()=>({data:state.paths.slice(state.missing?1:0).map(path=>({name:path.split('/').at(-1),metadata:{size:3}})),error:null}),download:async()=>({data:new Blob([new Uint8Array([0xff,0xd8,0xff])]),error:null}),remove:async()=>({error:null})})}
})}));
import {POST} from './route';
const id='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{state.paths=Array.from({length:7},()=>`photos/link/${id}/${crypto.randomUUID()}.jpg`);state.saved=null;state.missing=false});
function submit(photoPaths=state.paths){return POST(new Request('https://example.com/api/waste/submit',{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body:JSON.stringify({requestId:id,date:'2026-01-01',time:'10:00',bins:2,photoPaths})}))}
it('saves all seven verified uploaded photos',async()=>{expect((await submit()).status).toBe(200);expect(state.saved).toMatchObject({photos:state.paths,security_link_id:'link'})});
it('does not save an incomplete batch',async()=>{state.missing=true;expect((await submit()).status).toBe(400);expect(state.saved).toBeNull()});
it('rejects another security link folder',async()=>{expect((await submit(state.paths.map(p=>p.replace('/link/','/other/')))).status).toBe(400);expect(state.saved).toBeNull()});
it('rejects over twenty paths before saving',async()=>{expect((await submit(Array.from({length:21},()=>`photos/link/${id}/${crypto.randomUUID()}.jpg`))).status).toBe(400);expect(state.saved).toBeNull()});
