import {describe,it,expect} from 'vitest';
import {getCheckoutDashboardCounts,type CheckoutReportRoom,type CheckoutStatusReport,type CheckoutDashboardSource} from './checkout-status-dashboard';
const room=(id:string,changes:Partial<CheckoutReportRoom>={}):CheckoutReportRoom=>({id,reference_no:id,room_no:id,block:'A',status:'rectification',maintenance:'Abdullah',assigned_to:'worker',cleaner:'Unassigned',cleaner_id:null,maintenance_status:'In Progress',cleaner_status:'Not handed to cleaning',repair_percent:0,maintenance_today:false,cleaner_today:false,...changes});
const source=(id:string,changes:Partial<CheckoutDashboardSource>={}):CheckoutDashboardSource=>({id,defect_count:1,can_assign_cleaner:false,...changes});
describe('check-out dashboard counts',()=>{
 it('includes rooms ready for cleaner assignment and counts each active room once',()=>{
  const rooms=[room('a',{status:'verification',repair_percent:100,maintenance_status:'Completed'}),room('b',{status:'second_inspection',assigned_to:null}),room('c',{status:'cleaning',cleaner_id:'cleaner',cleaner:'Mary',cleaner_status:'In Progress'}),room('d',{status:'ready_for_occupancy',cleaner_id:'cleaner',cleaner:'Mary',cleaner_status:'Completed'}),room('e',{status:'second_inspection',repair_percent:100,assigned_to:null})];
  const sources=[source('a',{can_assign_cleaner:true}),source('b'),source('c'),source('d'),source('e',{defect_count:0,can_assign_cleaner:true})];
  const counts=getCheckoutDashboardCounts({rooms} as CheckoutStatusReport,sources);
  expect(counts.awaitingCleaning).toBe(2);
  expect(counts.cleaningActive).toBe(1);
  expect(counts.awaitingCleaning+counts.cleaningActive).toBe(3);
  expect(counts.cleaningCompleted).toBe(1);
  expect(counts.awaitingMaintenance).toBe(1);
  expect(counts.maintenance.get('worker')).toMatchObject({total:3,completed:1,active:2});
 });
});
