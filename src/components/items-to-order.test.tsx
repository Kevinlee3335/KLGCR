import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ItemsToOrder } from './items-to-order';
import type { ProcurementRow } from '@/lib/inventory-procurement';
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();});
const rows:ProcurementRow[]=Array.from({length:7},(_,i)=>({id:String(i),itemIds:[`id-${i}`],item_code:`CODE-${i}`,description:`Material ${i}`,brands:[],balance_qty:0,reorder_level:2,unit:'pcs',buyWhenNeeded:false,needsOrder:true,unverified:false}));
it('selects all matches including collapsed rows and submits every selected id',()=>{
  const {container}=render(<ItemsToOrder rows={rows} store="building" canManage/>);
  fireEvent.click(screen.getByLabelText('Select All (7)'));
  expect(screen.getByText('7 selected')).toBeTruthy();
  expect(container.querySelector('form')!.querySelectorAll('input[name="itemIds"]')).toHaveLength(7);
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'CODE-3'}});
  expect(container.querySelector('form')!.querySelectorAll('input[name="itemIds"]')).toHaveLength(0);
  fireEvent.click(screen.getByLabelText('Select Material 3'));
  expect(container.querySelector<HTMLInputElement>('input[name="itemIds"]')?.value).toBe('id-3');
});
it('shows hidden materials on reopening and supports restore without losing stock',()=>{
  const {container}=render(<ItemsToOrder rows={[{...rows[0],buyWhenNeeded:true,needsOrder:false}]} store="building" canManage initialView="hidden"/>);
  expect(screen.getByText('Material 0')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Select Material 0'));
  expect(container.querySelector<HTMLInputElement>('input[name="mode"]')?.value).toBe('maintain_stock');
  expect(screen.getAllByRole('button',{name:'Restore Stock Alert'})[0]).toBeTruthy();
});
it('does not offer management viewers mutation controls',()=>{
  render(<ItemsToOrder rows={rows} store="building" canManage={false}/>);
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button',{name:'Restore Stock Alert'})).toBeNull();
});
it('allows editing PO quantities and rejects zero without navigating',()=>{
 render(<ItemsToOrder rows={rows} store="building" canManage/>);
 fireEvent.change(screen.getByLabelText('PO quantity for Material 0'),{target:{value:'0'}});
 fireEvent.click(screen.getAllByRole('button',{name:'Add to PO'})[0]);
 expect(screen.getByRole('alert').textContent).toContain('Enter a quantity');
 fireEvent.change(screen.getByLabelText('PO quantity for Material 0'),{target:{value:'12'}});
 expect((screen.getByLabelText('PO quantity for Material 0') as HTMLInputElement).value).toBe('12');
});

it('each row submits only its own group without the bulk selection',()=>{
 const {container}=render(<ItemsToOrder rows={rows} store="building" canManage/>);
 const button=screen.getAllByRole('button',{name:'Buy When Needed'})[1] as HTMLButtonElement;
 expect(button.form?.id).toBe('procurement-item-0');
 expect(new FormData(button.form!).getAll('itemIds')).toEqual(['id-0']);
 expect(new FormData(button.form!).get('mode')).toBe('buy_when_needed');
 expect(container.querySelector('form')!.querySelectorAll('input[name="itemIds"]')).toHaveLength(0);
});

it('hides a row in place while preserving Show All and search',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,url:'https://example.com/admin/inventory?success=buy_when_needed'}));
 render(<ItemsToOrder rows={rows} store="building" canManage/>);
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Material'}});
 fireEvent.click(screen.getByRole('button',{name:'Show all 7 items'}));
 fireEvent.click(screen.getAllByRole('button',{name:'Buy When Needed'})[1]);
 await waitFor(()=>expect(screen.queryByText('Material 0')).toBeNull());
 expect(screen.getByText('Material 6')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Show first 5 items'})).toBeTruthy();
 expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Material');
});
it('adds multiple items to a PO list without leaving or collapsing the table',()=>{
 render(<ItemsToOrder rows={rows} store="building" canManage/>);
 fireEvent.click(screen.getByRole('button',{name:'Show all 7 items'}));
 fireEvent.change(screen.getByLabelText('PO quantity for Material 0'),{target:{value:'8'}});
 fireEvent.click(screen.getAllByRole('button',{name:'Add to PO'})[0]);
 fireEvent.click(screen.getAllByRole('button',{name:'Add to PO'})[6]);
 const link=screen.getAllByRole('link',{name:'Open PO (2)'})[1];
 const draft=JSON.parse(new URL(link.getAttribute('href')!,'https://example.com').searchParams.get('draft')!);
 expect(draft).toEqual([{itemId:'id-0',quantity:8},{itemId:'id-6',quantity:2}]);
 expect(screen.getByText('Material 6')).toBeTruthy();
});
