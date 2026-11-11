import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {CheckoutProgressTable} from './checkout-progress-table';
import type {CheckoutProgressPagination, CheckoutProgressRow} from '@/lib/checkout-progress';
const mocks=vi.hoisted(()=>({assign:vi.fn(),refresh:vi.fn(),push:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh,push:mocks.push,replace:mocks.replace})}));
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

describe('checkout maintenance bulk assignment',()=>{
 it('assigns selected unassigned rooms and blocks rooms already in progress',async()=>{
  const awaiting=[{...base,id:'a',reference_no:'A',room_no:'204',status:'second_inspection' as const,defects:[{description:'Fan',status:'open'}]},{...base,id:'b',reference_no:'B',room_no:'205',status:'second_inspection' as const,defects:[{description:'Room Wall Moldy',status:'open'}]},rows[2]];
  mocks.assign.mockResolvedValue({count:2});
  render(<CheckoutProgressTable rows={awaiting} cleaners={[]} maintenanceWorkers={[{id:'m1',full_name:'Abdullah'}]} isAdmin canAssignCleaner={false}/>);
  expect(screen.getByLabelText('Select maintenance room 103')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Select maintenance room 204'));
  fireEvent.click(screen.getByLabelText('Select maintenance room 205'));
  fireEvent.change(screen.getByLabelText('Maintenance'),{target:{value:'m1'}});
  fireEvent.click(screen.getByRole('button',{name:'Assign 2 room(s) to maintenance'}));
  await waitFor(()=>expect(mocks.assign).toHaveBeenCalledWith(['a','b'],'m1','maintenance'));
 });
});

it('filters blocks and clears selected rooms when changing blocks',()=>{
 const data=[{...base,id:'a1',reference_no:'A1',room_no:'101',status:'second_inspection' as const,defects:[{description:'Fan',status:'open'}]},{...base,id:'b1',reference_no:'B1',room_no:'101',block:{code:'B'},status:'second_inspection' as const,defects:[{description:'Fan',status:'open'}]}];
 render(<CheckoutProgressTable rows={data} cleaners={[]} maintenanceWorkers={[{id:'m1',full_name:'Abdullah'}]} isAdmin canAssignCleaner={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Block A'}));
 fireEvent.click(screen.getByLabelText('Select maintenance room 101'));
 expect(screen.getByRole('button',{name:'Assign 1 room(s) to maintenance'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Block B'}));
 expect(screen.queryByText('A1')).not.toBeInTheDocument();
 expect(screen.getByText('B1')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Assign 0 room(s) to maintenance'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'All Blocks'}));
 expect(screen.getByText('A1')).toBeInTheDocument();
});

it('searches room numbers together with block filters and clears the query',()=>{
 const data=[
  {...base,id:'a601',reference_no:'A601-ref',room_no:'601',block:{code:'A'},status:'second_inspection' as const,defects:[{description:'Fan',status:'open'}]},
  {...base,id:'b601',reference_no:'B601-ref',room_no:'601',block:{code:'B'},status:'second_inspection' as const,defects:[{description:'Fan',status:'open'}]},
  {...base,id:'b608',reference_no:'B608-ref',room_no:'608',block:{code:'B'},status:'verification' as const,defects:[{description:'Fan',status:'rectified'}]}
 ];
 render(<CheckoutProgressTable rows={data} cleaners={[]} isAdmin canAssignCleaner={false}/>);
 const search=screen.getByRole('searchbox',{name:'Search room'});
 fireEvent.change(search,{target:{value:'b-601'}});
 expect(screen.getByText('B601-ref')).toBeInTheDocument();
 expect(screen.queryByText('A601-ref')).not.toBeInTheDocument();
 expect(screen.queryByText('B608-ref')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Block A'}));
 expect(screen.getByText('No rooms match your search or filters')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'All Blocks'}));
 fireEvent.click(screen.getByRole('button',{name:'Clear room search'}));
 expect(screen.getByText('A601-ref')).toBeInTheDocument();
 expect(screen.getByText('B608-ref')).toBeInTheDocument();
 fireEvent.change(search,{target:{value:'601'}});
 expect(screen.getByText('A601-ref')).toBeInTheDocument();
 expect(screen.getByText('B601-ref')).toBeInTheDocument();
 expect(screen.queryByText('B608-ref')).not.toBeInTheDocument();
});

it('keeps selections across pages and resets them when changing server filters', async () => {
 const row = (id: string, room: string): CheckoutProgressRow => ({
  id, room_no: room, reference_no: id, status: 'second_inspection', assigned_to: null, cleaner_id: null,
  created_at: base.created_at, block_code: 'A', maintenance_name: null, cleaner_name: null,
  defect_count: 1, remaining_count: 1, painting_status: null, progress_status: 'awaiting_maintenance',
  can_assign_cleaner: false, can_assign_maintenance: true, can_assign_painting: false,
 });
 const pagination: CheckoutProgressPagination = {
  blocks: ['A', 'B', 'C', 'D'], filters: { block: 'A', status: 'awaiting_maintenance', room: '' }, page: 1, hasNext: true,
 };
 const table = (rooms: CheckoutProgressRow[], page: CheckoutProgressPagination) => <CheckoutProgressTable
  rows={rooms} pagination={page} cleaners={[]} maintenanceWorkers={[{id:'m1',full_name:'Abdullah'}]} isAdmin canAssignCleaner={false}
 />;
 const {rerender} = render(table([row('a', '101')], pagination));
 fireEvent.click(screen.getByLabelText('Select maintenance room 101'));
 fireEvent.click(screen.getByRole('button', { name: 'Next' }));
 expect(mocks.push).toHaveBeenCalledWith('/admin/checkouts?block=A&status=awaiting_maintenance&page=2', { scroll: false });
 rerender(table([row('b', '102')], {...pagination, page: 2, hasNext: false}));
 fireEvent.click(screen.getByLabelText('Select all available maintenance rooms'));
 expect(screen.getByRole('button', { name: 'Assign 2 room(s) to maintenance' })).toBeInTheDocument();
 fireEvent.click(screen.getByLabelText('Select all available maintenance rooms'));
 expect(screen.getByRole('button', { name: 'Assign 1 room(s) to maintenance' })).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button', { name: 'Block C' }));
 expect(mocks.replace).toHaveBeenCalledWith('/admin/checkouts?block=C&status=awaiting_maintenance', { scroll: false });
 expect(screen.getByRole('button', { name: 'Assign 0 room(s) to maintenance' })).toBeDisabled();
 fireEvent.change(screen.getByRole('searchbox', { name: 'Search room' }), { target: { value: 'C-101' } });
 await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/admin/checkouts?block=C&status=awaiting_maintenance&room=C-101', { scroll: false }));
});
