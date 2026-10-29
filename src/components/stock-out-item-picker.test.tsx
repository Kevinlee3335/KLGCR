import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { StockOutItemPicker } from './stock-out-item-picker';
it('filters by code or name and clears a prior selection when the search changes', () => {
 render(<StockOutItemPicker items={[{id:'paint',item_code:'PG00072',description:'A-CLASS Waterproof liquid 4KG',balance_qty:2,unit:'units'},{id:'fan',item_code:'E00001',description:'Ceiling Fan',balance_qty:3,unit:'pcs'}]}/>);
 const search=screen.getByLabelText('Search Item Code or Name');
 fireEvent.change(search,{target:{value:'waterproof 4kg'}});
 expect(screen.getByRole('option',{name:/PG00072/})).toBeInTheDocument();
 expect(screen.queryByRole('option',{name:/Ceiling Fan/})).not.toBeInTheDocument();
 const select=screen.getByLabelText('Item');
 fireEvent.change(select,{target:{value:'paint'}});
 expect(select).toHaveValue('paint');
 fireEvent.change(search,{target:{value:'e00001'}});
 expect(select).toHaveValue('');
 expect(screen.getByRole('option',{name:/Ceiling Fan/})).toBeInTheDocument();
 fireEvent.change(search,{target:{value:'missing'}});
 expect(screen.getByRole('status')).toHaveTextContent('0 matching items');
});
