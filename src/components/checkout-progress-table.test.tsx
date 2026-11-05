import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {CheckoutProgressTable} from './checkout-progress-table';
const mocks=vi.hoisted(()=>({assign:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock('@/app/(dashboard)/admin/checkouts/actions',()=>({bulkAssignCheckouts:mocks.assign}));
const base={utmspace_defects:'Fan',inspection_notes:null,assigned_to:null,cleaner_id:null,created_at:'2026-11-04T00:00:00Z',ready_at:null,block:{code:'A'},assignee:null,cleaner:null,painting:[]};
const rows=[{...base,id:'1',reference_no:'R1',room_no:'101',status:'verification' as const,defects:[{description:'Fan',status:'rectified'}]},{...base,id:'2',reference_no:'R2',room_no:'102',status:'verification' as const,defects:[{description:'Fan',status:'rectified'}]},{...base,id:'3',reference_no:'R3',room_no:'103',status:'rectification' as const,defects:[{description:'Fan',status:'open'}]}];
describe('checkout cleaner bulk assignment',()=>{
 it('assigns selected eligible rooms and blocks unfinished rooms',async()=>{
  mocks.assign.mockResolvedValue({count:2});render(<CheckoutProgressTable rows={rows} cleaners={[{id:'c1',full_name:'Cleaner'}]} isAdmin canAssignCleaner/>);
  expect(screen.getByLabelText('Select room 103')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Select room 101'));fireEvent.click(screen.getByLabelText('Select room 102'));
  fireEvent.change(screen.getByLabelText('Cleaner / Housekeeping'),{target:{value:'c1'}});
  fireEvent.click(screen.getByRole('button',{name:'Assign 2 room(s) to cleaner'}));
  await waitFor(()=>expect(mocks.assign).toHaveBeenCalledWith(['1','2'],'c1','cleaner'));
  expect(await screen.findByText('2 room(s) assigned successfully.')).toBeInTheDocument();expect(mocks.refresh).toHaveBeenCalled();
 });
 it('hides assignment controls without coordinator permission',()=>{render(<CheckoutProgressTable rows={rows} cleaners={[]} isAdmin canAssignCleaner={false}/>);expect(screen.queryByLabelText('Select room 101')).not.toBeInTheDocument()});
});
