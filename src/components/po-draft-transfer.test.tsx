import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {ItemsToOrder} from './items-to-order';
import {PurchaseOrders} from './purchase-orders';
vi.mock('./signature-pad',()=>({SignaturePad:()=>null}));
vi.mock('./po-receiving',()=>({GoodsReceiving:()=>null}));
afterEach(()=>{cleanup();localStorage.clear();});
it('loads added item and quantity on the normal PO page and after remount',()=>{
 const item={id:'item-one',item_code:'KLGCR-B001',description:'Test Cement',unit:'bags'};
 render(<ItemsToOrder rows={[{...item,itemIds:[item.id],brands:[],balance_qty:0,reorder_level:2,buyWhenNeeded:false,needsOrder:true,unverified:false}]} store="building" canManage/>);
 fireEvent.change(screen.getByLabelText('PO quantity for Test Cement'),{target:{value:'9'}});
 fireEvent.click(screen.getByRole('button',{name:'Add to PO'}));
 expect(screen.getByRole('status').textContent).toContain('Added to PO');
 cleanup();
 for(let i=0;i<2;i++){
 render(<PurchaseOrders items={[item]} orders={[]} requester="Kevin" canCreate/>);
 expect((screen.getByLabelText('Item 1') as HTMLInputElement).value).toBe('Test Cement');
 expect((screen.getByLabelText('Quantity 1') as HTMLInputElement).value).toBe('9');
 cleanup();
 }
});
