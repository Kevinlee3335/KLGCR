import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {OfficeUsageForm} from './office-usage-form';
const {refresh}=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
afterEach(()=>{vi.restoreAllMocks();refresh.mockReset();});
it('records who took supplies and prevents repeat submission after success',async()=>{
 const fetcher=vi.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({usage:{id:'record',balance_after:8.75,unit:'RIM'}})} as Response);
 render(<OfficeUsageForm name="Kevin" items={[{id:'10000000-0000-4000-8000-000000000001',item_code:'OFF-0001',description:'Paper',unit:'RIM',balance_qty:10,quantity_unverified:false}]}/>);
 fireEvent.change(screen.getByLabelText('Taken by'),{target:{value:'Alice'}});fireEvent.change(screen.getByLabelText('Office item'),{target:{value:'10000000-0000-4000-8000-000000000001'}});fireEvent.change(screen.getByLabelText('Quantity taken (RIM)'),{target:{value:'1.25'}});
 fireEvent.click(screen.getByRole('button',{name:'Record Supplies Taken'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Recorded successfully'));
 expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toMatchObject({takenBy:'Alice',quantity:1.25,itemId:'10000000-0000-4000-8000-000000000001'});expect(refresh).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Record Supplies Taken'}));expect(fetcher).toHaveBeenCalledTimes(1);
});
