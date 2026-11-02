import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({stage:0,approved:false,existing:false,notify:vi.fn()}));
vi.mock('./app-notifications',()=>({createAppNotifications:m.notify}));
vi.mock('./supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>({
 select(){return this},eq(){return this},single:async()=>({data:{kind:'utility',period:'2026-11'},error:null}),
 maybeSingle:async()=>({data:table==='document_verifications'?{entries:Array(m.stage).fill({})}:m.approved?{run_id:'pack'}:null,error:null}),
 limit:async()=>({data:m.existing?[{id:'notice'}]:[],error:null})
})})}));
import {notifyDocumentReviewer} from './document-review-notifications';
beforeEach(()=>{m.stage=0;m.approved=false;m.existing=false;m.notify.mockClear()});
it.each([[0,'a21286a7-56fd-48e4-9571-ffeacf825692'],[1,'7a40e00f-2e95-4c27-83d9-0f7dba788b77'],[2,'eeab5f04-30c3-42bd-a095-58e56c814358']])('notifies only the assigned reviewer at stage %i',async(stage,id)=>{
 m.stage=stage;await notifyDocumentReviewer('billing','pack');
 expect(m.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({recipientIds:[id],href:'/admin/document-review/billing/pack',entityId:'pack'}));
});
it('does not notify after approval or duplicate a delivered stage notice',async()=>{
 m.approved=true;await notifyDocumentReviewer('billing','pack');m.approved=false;m.existing=true;await notifyDocumentReviewer('billing','pack');expect(m.notify).not.toHaveBeenCalled();
});
