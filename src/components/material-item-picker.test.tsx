import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MaterialItemPicker } from './material-item-picker';
const items = [{id:'lock-id',item_code:'KLGCR-B00027',description:'BRAND : DORETTI :CYLINDRICAL LOCK\n& BSA',balance_qty:12,unit:'pcs'}];
describe('material selection', () => {
 it('keeps the selected inventory ID when revisiting the displayed label', () => {
  const {container}=render(<MaterialItemPicker items={items} name="itemId" required/>);
  const input=screen.getByRole('combobox');
  fireEvent.change(input,{target:{value:'B00027'}});
  fireEvent.click(screen.getByRole('option'));
  fireEvent.focus(input);
  expect(screen.queryByText('No active inventory item matches this search.')).toBeNull();
  expect(container.querySelector('input[name="itemId"]')).toHaveValue('lock-id');
  fireEvent.change(input,{target:{value:'KLGCR-B00027 · BRAND : DORETTI :CYLINDRICAL LOCK & BSA'}});
  expect(container.querySelector('input[name="itemId"]')).toHaveValue('lock-id');
 });
 it('blocks unmatched typed text instead of submitting an empty inventory ID',()=>{
  render(<MaterialItemPicker items={items} name="itemId" required/>);
  const input=screen.getByRole('combobox') as HTMLInputElement;
  fireEvent.change(input,{target:{value:'missing'}});
  expect(input.checkValidity()).toBe(false);
 });
});
