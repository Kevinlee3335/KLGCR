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
