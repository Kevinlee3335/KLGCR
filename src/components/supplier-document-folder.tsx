'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { classifySupplierDocument } from '@/app/(dashboard)/documents/suppliers/actions';
import { folders } from '@/lib/supplier-mail/rules';
export function SupplierDocumentFolder({id,folder}:{id:string;folder:string}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const router=useRouter();
 return <label>Folder <select value={folder} disabled={busy} onChange={async event=>{setBusy(true);setError('');try{await classifySupplierDocument(id,event.target.value);router.refresh();}catch{setError('Unable to save folder.');}finally{setBusy(false);}}}>{folders.map(f=><option key={f}>{f}</option>)}</select>{error&&<span role="alert">{error}</span>}</label>;
}
