import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock('@/app/(dashboard)/admin/members/payment-list/actions',()=>({saveReceiptNumber:mocks.save}));
import {MembershipReceiptNumber} from './membership-receipt-number';
it('keeps a typed receipt during automatic refresh and sends the original value for conflict checking',async()=>{
 mocks.save.mockResolvedValue({success:true,value:'KLGCR / 18002'});
 const {rerender}=render(<MembershipReceiptNumber id="record" receipt="KLGCR / 17801" name="Student"/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'KLGCR / 18002'}});
 rerender(<MembershipReceiptNumber id="record" receipt="Another Admin" name="Student"/>);
 expect(screen.getByRole('textbox')).toHaveValue('KLGCR / 18002');
 fireEvent.submit(screen.getByRole('button').closest('form')!);
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('saved'));
 const form=mocks.save.mock.calls[0][0] as FormData;
 expect(form.get('receipt')).toBe('KLGCR / 18002');expect(form.get('expected')).toBe('KLGCR / 17801');expect(mocks.refresh).toHaveBeenCalled();
});
