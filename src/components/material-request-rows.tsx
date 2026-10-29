'use client';
import {useRef,useState} from 'react';
import {MaterialItemPicker} from '@/components/material-item-picker';
type MaterialItem={id:string;item_code:string;description:string;balance_qty:number|string;unit:string|null};
export function MaterialRequestRows({items}:{items:MaterialItem[]}){
 const [rows,setRows]=useState([1,2,3]);const next=useRef(4);
 return <div className="material-rows">{rows.map((id,index)=><fieldset className="material-row" key={id}><legend>Material {index+1}{index>0&&<span>Optional</span>}</legend><div className="material-field material-select-field"><span>Material</span><MaterialItemPicker name="itemId" required={index===0} items={items}/></div><label className="material-field material-quantity-field"><span>Quantity</span><input name="qty" type="number" inputMode="decimal" min="0.01" step="0.01" required={index===0}/></label>{index>0&&<button type="button" className="button secondary material-remove-row" aria-label={`Remove material ${index+1}`} onClick={()=>setRows(current=>current.filter(row=>row!==id))}>Remove</button>}</fieldset>)}<button type="button" className="button secondary material-add-row" onClick={()=>{const id=next.current++;setRows(current=>[...current,id]);}}>＋ Add Material</button></div>;
}
