import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {MembershipPaymentDelete} from './membership-payment-delete';
const {remove,refresh}=vi.hoisted(()=>({remove:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
vi.mock('@/app/(dashboard)/admin/members/payment-list/actions',()=>({deletePaymentListEntry:remove}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks();});
it('cancel leaves the entry unchanged',()=>{
 vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<MembershipPaymentDelete id="test-id" name="Test Member"/>);
 fireEvent.click(screen.getByRole('button',{name:'Delete payment entry for Test Member'}));
 expect(remove).not.toHaveBeenCalled();
});
it('confirmed deletion submits only the selected entry and refreshes',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);remove.mockResolvedValue({success:true});
 render(<MembershipPaymentDelete id="selected-id" name="Test Member"/>);
 fireEvent.click(screen.getByRole('button',{name:'Delete payment entry for Test Member'}));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Deleted'));
 expect(remove.mock.calls[0][0].get('ledger')).toBe('selected-id');expect(refresh).toHaveBeenCalledOnce();
});
it('failed deletion displays an error and keeps the entry available',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);remove.mockResolvedValue({error:'Unable to delete.'});
 render(<MembershipPaymentDelete id="selected-id" name="Test Member"/>);
 fireEvent.click(screen.getByRole('button',{name:'Delete payment entry for Test Member'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Unable to delete.'));
 expect(refresh).not.toHaveBeenCalled();expect(screen.getByRole('button')).not.toBeDisabled();
});
