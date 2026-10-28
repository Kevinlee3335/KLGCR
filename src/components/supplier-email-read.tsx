'use client';
import { useEffect, useState } from 'react';
import { markSupplierEmailRead } from '@/app/(dashboard)/documents/suppliers/actions';
export function SupplierEmailRead({id}:{id:string}) {
  const [error,setError]=useState(false);
  useEffect(()=>{markSupplierEmailRead(id).catch(()=>setError(true));},[id]);
  return error?<p role="status">Read status could not be saved. Refresh to retry.</p>:null;
}
