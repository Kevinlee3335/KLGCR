"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Check,Save,LoaderCircle} from 'lucide-react';
import {saveReceiptNumber} from '@/app/(dashboard)/admin/members/payment-list/actions';
export function MembershipReceiptNumber({id,receipt,name}:{id:string;receipt:string;name:string}){
 const router=useRouter();
 const [value,setValue]=useState(receipt),[expected,setExpected]=useState(receipt),[pending,setPending]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
 const editing=useRef(false);
 useEffect(()=>{if(!editing.current){setValue(receipt);setExpected(receipt);}},[receipt]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending)return;setPending(true);setError('');setSaved(false);
  const form=new FormData();form.set('ledger',id);form.set('receipt',value);form.set('expected',expected);
  try{
   const result=await saveReceiptNumber(form);
   if(result.success){const next=result.value||'';setValue(next);setExpected(next);editing.current=false;setSaved(true);router.refresh();}
   else setError(result.error||'Unable to save.');
  }catch{setError('Unable to save. Please try again.');}finally{setPending(false);}
 }
 return <form className={`receipt-number-editor${error?' has-error':''}`} onSubmit={submit}>
  <input aria-label={`Receipt number for ${name}`} value={value} maxLength={100} placeholder="Enter receipt no" disabled={pending} onChange={event=>{editing.current=true;setValue(event.target.value);setSaved(false);setError('');}}/>
  <button type="submit" disabled={pending||value.trim()===expected} aria-label={`Save receipt number for ${name}`} title={saved?'Saved':'Save receipt number'}>{pending?<LoaderCircle size={13} className="receipt-save-spin"/>:saved?<Check size={13}/>:<Save size={13}/>}</button>
  {saved&&<span className="sr-only" role="status">Receipt number saved.</span>}{error&&<span className="receipt-number-error" role="alert">{error}</span>}
 </form>;
}
