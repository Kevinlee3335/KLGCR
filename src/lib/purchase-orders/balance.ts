export type BalanceItem={id:string;balance_qty:number|string|null;stock_group?:string|null;inventory_group?:string;quantity_unverified?:boolean};
export function itemBalance(items:BalanceItem[],id:string):number|null{
 const item=items.find(item=>item.id===id);if(!item)return null;
 const members=item.stock_group?items.filter(other=>other.stock_group===item.stock_group&&other.inventory_group===item.inventory_group):[item];
 if(members.some(member=>member.quantity_unverified||member.balance_qty==null||!Number.isFinite(Number(member.balance_qty))))return null;
 return members.reduce((sum,member)=>sum+Number(member.balance_qty),0);
}
export function balanceLabel(balance:number|null|undefined,unit:string|null=''){
 return `Balance Qty: ${balance==null?'Pending confirmation':`${Number(balance.toFixed(2))}${unit?' '+unit:''}`}`;
}
