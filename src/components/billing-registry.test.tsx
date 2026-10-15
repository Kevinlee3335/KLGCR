import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {BillingRegistry} from './billing-registry';
import {configSchema,defaultBillingConfig} from '@/lib/billing-preview';
import fixture from '@/lib/billing-preview-fixture.json';
const config=configSchema.parse({...defaultBillingConfig,...fixture});
describe('registry persistence',()=>{
 it('saves contract details without dropping existing meters or unrelated accounts',async()=>{const save=vi.fn().mockResolvedValue(undefined);render(<BillingRegistry config={config} busy={false} onSave={save}/>);fireEvent.click(screen.getAllByText('Edit / Terminate')[0]);fireEvent.change(screen.getByLabelText('contact'),{target:{value:'Site contact'}});fireEvent.click(screen.getByText('Save registry'));await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));const result=configSchema.parse(save.mock.calls[0][0]);expect(result.utilityAccounts[0].registry?.contact).toBe('Site contact');expect(result.utilityAccounts[0].meters).toEqual(config.utilityAccounts[0].meters);expect(result.utilityAccounts.slice(1)).toEqual(config.utilityAccounts.slice(1))});
});
