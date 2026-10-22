import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {PoApprovalQueue} from './po-approval-queue';
afterEach(()=>vi.restoreAllMocks());
const order={id:'sample',po_no:'KH/KLG/PO/2026-0030',requested_by:'Kevin',revision:3};
it('opens the selected PO and approves the reviewed revision from Dashboard',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);
 const fetcher=vi.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({order:{}})} as Response);
 render(<PoApprovalQueue orders={[order]} total={1}/>);
 expect(screen.getByRole('link',{name:'Review PO'})).toHaveAttribute('href','/admin/inventory/purchase-orders?po=sample');
 fireEvent.click(screen.getByRole('button',{name:'Approve'}));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('creator has been notified'));
 expect(fetcher).toHaveBeenCalledWith('/api/purchase-orders/sample/approve',expect.objectContaining({body:JSON.stringify({expectedRevision:3})}));
 expect(screen.queryByRole('button',{name:'Approve'})).not.toBeInTheDocument();
});
it('keeps a changed PO in the queue and displays the review error',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);
 vi.spyOn(global,'fetch').mockResolvedValue({ok:false,json:async()=>({error:'Refresh and review the latest PO.'})} as Response);
 render(<PoApprovalQueue orders={[order]} total={1}/>);fireEvent.click(screen.getByRole('button',{name:'Approve'}));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('review the latest PO'));
 expect(screen.getByRole('button',{name:'Approve'})).not.toBeDisabled();
});
