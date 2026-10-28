import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({emails:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/supplier-mail/queries',()=>({recentSupplierEmails:mocks.emails}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.client}));
import {SupplierMailSummary} from './supplier-mail-summary';
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('hides the entire dashboard panel when there is no mail today',async()=>{
 mocks.emails.mockResolvedValue({data:[],error:null});
 expect(await SupplierMailSummary()).toBeNull();
 expect(mocks.client).not.toHaveBeenCalled();
});
it('shows today mail with its original email link',async()=>{
 mocks.emails.mockResolvedValue({data:[{id:'1234567890',company:'mfe',subject:'New quotation',received_at:'2026-10-28T03:00:00Z'}],error:null});
 mocks.client.mockResolvedValue({from:()=>({select:()=>({in:async()=>({data:[],error:null})})})});
 render(await SupplierMailSummary());
 expect(screen.getByText('Supplier emails today')).toBeTruthy();
 expect(screen.getByRole('link',{name:/New quotation/}).getAttribute('href')).toBe('/documents/suppliers/mfe/emails/1234567890');
});
