"use client";
import {useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Plus} from 'lucide-react';
import {addDepositEntry} from '@/app/(dashboard)/admin/members/payment-list/actions';
export function MembershipDepositAdd({defaultDate}:{defaultDate:string}){
 const router=useRouter(),requestId=useRef('');
 const [open,setOpen]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending)return;
  const form=new FormData(event.currentTarget);if(!requestId.current)requestId.current=crypto.randomUUID();form.set('id',requestId.current);
  setPending(true);setError('');setSaved(false);
  try{const result=await addDepositEntry(form);if(result.success){setSaved(true);setOpen(false);requestId.current='';router.refresh();}else setError(result.error||'Unable to save.');}catch{setError('Unable to save. Please try again.');}finally{setPending(false);}
 }
 return <div className="deposit-add"><button type="button" className="button secondary" onClick={()=>{setOpen(!open);setSaved(false);setError('');}} aria-expanded={open} disabled={pending}><Plus size={13}/>Add Row</button>
 {saved&&<p role="status" className="deposit-saved">Deposit saved successfully.</p>}
 {open&&<form onSubmit={save} className="deposit-add-form"><label>Date<input type="date" name="date" defaultValue={defaultDate} min="2000-01-01" max="2100-12-31" required disabled={pending}/></label><label>Name<input name="name" maxLength={200} required disabled={pending}/></label><label>Deposit (RM)<input value="10.00" readOnly aria-label="Deposit amount in RM"/></label><label>Receipt No<input name="receipt" maxLength={100} required disabled={pending}/></label><label>Room / Member No (optional)<input name="reference" maxLength={100} disabled={pending}/></label><button className="button" disabled={pending}>{pending?'Saving…':'Save'}</button><button type="button" className="button secondary" disabled={pending} onClick={()=>setOpen(false)}>Cancel</button><p className="subtle">RM10 Access Card Deposit · Payment List only · Excluded from Committee Report.</p>{error&&<p role="alert" className="error">{error}</p>}</form>}
 </div>;
}
