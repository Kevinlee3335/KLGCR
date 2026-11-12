import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({insert:vi.fn().mockResolvedValue({error:null}),push:vi.fn(),scope:vi.fn().mockResolvedValue({data:[{id:'gym'}],error:null}),after:vi.fn<(callback:()=>Promise<void>)=>void>()}));
vi.mock('next/server',()=>({after:mocks.after}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>table==='profiles'?{select:()=>({in:()=>({eq:mocks.scope})})}:{insert:mocks.insert}})}));
vi.mock('@/lib/push',()=>({sendPushNotifications:mocks.push}));
import {createAppNotifications} from './app-notifications';
beforeEach(()=>{vi.clearAllMocks()});
it('excludes Gym Patrol accounts from internal staff notices and pushes',async()=>{
 await createAppNotifications({recipientIds:['gym','staff'],type:'calendar_event',title:'Meeting',body:'Private staff notes',href:'/staff/calendar'});
 expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({recipient_id:'staff'})]);
 expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({recipientIds:['staff']}));
});

it('saves the in-app notice before scheduling its phone push',async()=>{
 await createAppNotifications({recipientIds:['gym','staff'],type:'checkout_assigned',title:'Room ready',body:'Room A101',href:'/staff/checkouts/assign',deferPush:true});
 expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({recipient_id:'staff',type:'checkout_assigned'})]);
 expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(mocks.after.mock.invocationCallOrder[0]);
 expect(mocks.push).not.toHaveBeenCalled();
 await mocks.after.mock.calls[0][0]();
 expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({recipientIds:['staff'],href:'/staff/checkouts/assign'}));
});

it('still delivers the push if scheduling outside a request is unavailable',async()=>{
 mocks.after.mockImplementationOnce(()=>{throw new Error('No request context')});
 await createAppNotifications({recipientIds:['staff'],type:'daily_task_completed',title:'Task done',body:'Check lobby',href:'/admin/daily-tasks',deferPush:true});
 expect(mocks.push).toHaveBeenCalledOnce();
});
