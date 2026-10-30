import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ItemsToOrder } from './items-to-order';
import type { ProcurementRow } from '@/lib/inventory-procurement';
afterEach(cleanup);
const rows:ProcurementRow[]=Array.from({length:7},(_,i)=>({id:String(i),itemIds:[`id-${i}`],item_code:`CODE-${i}`,description:`Material ${i}`,brands:[],balance_qty:0,reorder_level:2,unit:'pcs',buyWhenNeeded:false,needsOrder:true,unverified:false}));
it('selects all matches including collapsed rows and submits every selected id',()=>{
  const {container}=render(<ItemsToOrder rows={rows} store="building" canManage/>);
  fireEvent.click(screen.getByLabelText('Select All (7)'));
  expect(screen.getByText('7 selected')).toBeTruthy();
  expect(container.querySelectorAll('input[name="itemIds"]')).toHaveLength(7);
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'CODE-3'}});
  expect(container.querySelectorAll('input[name="itemIds"]')).toHaveLength(0);
  fireEvent.click(screen.getByLabelText('Select Material 3'));
  expect(container.querySelector<HTMLInputElement>('input[name="itemIds"]')?.value).toBe('id-3');
});
it('shows hidden materials on reopening and supports restore without losing stock',()=>{
  const {container}=render(<ItemsToOrder rows={[{...rows[0],buyWhenNeeded:true,needsOrder:false}]} store="building" canManage initialView="hidden"/>);
  expect(screen.getByText('Material 0')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Select Material 0'));
  expect(container.querySelector<HTMLInputElement>('input[name="mode"]')?.value).toBe('maintain_stock');
  expect(screen.getByRole('button',{name:'Restore Stock Alert'})).toBeTruthy();
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
