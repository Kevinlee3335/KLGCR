import {expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({insert:vi.fn().mockResolvedValue({error:null}),push:vi.fn(),scope:vi.fn().mockResolvedValue({data:[{id:'gym'}],error:null})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>table==='profiles'?{select:()=>({in:()=>({eq:mocks.scope})})}:{insert:mocks.insert}})}));
vi.mock('@/lib/push',()=>({sendPushNotifications:mocks.push}));
import {createAppNotifications} from './app-notifications';
it('excludes Gym Patrol accounts from internal staff notices and pushes',async()=>{
 await createAppNotifications({recipientIds:['gym','staff'],type:'calendar_event',title:'Meeting',body:'Private staff notes',href:'/staff/calendar'});
 expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({recipient_id:'staff'})]);
 expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({recipientIds:['staff']}));
});
