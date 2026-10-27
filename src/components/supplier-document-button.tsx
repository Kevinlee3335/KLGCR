'use client';
import { useState } from 'react';
import { supplierDocumentUrl } from '@/app/(dashboard)/documents/suppliers/actions';
export function SupplierDocumentButton({id}:{id:string}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <><button className="button" disabled={busy} onClick={async()=>{const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;setBusy(true);setError('');try{const url=await supplierDocumentUrl(id);if(tab)tab.location.href=url;else window.location.href=url;}catch{tab?.close();setError('Unable to open PDF. Please retry.');}finally{setBusy(false);}}}>{busy?'Opening…':'Open PDF'}</button>{error&&<span role="alert">{error}</span>}</>;
}
