"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Trash2,LoaderCircle} from 'lucide-react';
import {deletePaymentListEntry} from '@/app/(dashboard)/admin/members/payment-list/actions';
export function MembershipPaymentDelete({id,name}:{id:string;name:string}){
 const router=useRouter();
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[deleted,setDeleted]=useState(false);
 async function remove(){
  if(pending||!window.confirm(`Delete the payment list entry for ${name}?\nIt will be removed from this list, its printout and any unsaved committee report. Saved reports and the member account are kept.`))return;
  setPending(true);setError('');
  try{
   const form=new FormData();form.set('ledger',id);
   const result=await deletePaymentListEntry(form);
   if(result.success){setDeleted(true);router.refresh();}
   else setError(result.error||'Unable to delete.');
  }catch{setError('Unable to delete. Please try again.');}finally{setPending(false);}
 }
 return <div className="payment-delete-control">{deleted?<span role="status">Deleted</span>:<button type="button" className="payment-delete-button" disabled={pending} onClick={remove} aria-label={`Delete payment entry for ${name}`} title="Delete payment entry">{pending?<LoaderCircle size={12} className="receipt-save-spin"/>:<Trash2 size={12}/>}<span>{pending?'Deleting…':'Delete'}</span></button>}{error&&<span className="receipt-number-error" role="alert">{error}</span>}</div>;
}
