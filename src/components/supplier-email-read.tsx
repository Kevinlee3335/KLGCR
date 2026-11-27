'use client';
import { useEffect, useRef, useState } from 'react';
import { markSupplierEmailRead } from '@/app/(dashboard)/documents/suppliers/actions';
export function SupplierEmailRead({id}:{id:string}) {
  const attempted = useRef<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  useEffect(() => {
    if (attempted.current === id) return;
    attempted.current = id;
    markSupplierEmailRead(id).catch(() => setFailedId(id));
  }, [id]);
  return failedId === id ? <p role="status">Read status could not be saved. Refresh to retry.</p> : null;
}
