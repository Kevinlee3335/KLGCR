import {PrintButton} from "@/components/print-button";
import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {CheckoutOperations} from '@/components/checkout-operations';
import {requireRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}){
 const profile=await requireRole(['admin','management_viewer']);const q=await searchParams;const db=await createClient();
 return <AppShell profile={profile} title="Check-out Team Report"><Link className="text-link" href="/admin/checkouts">← Check-out Rooms</Link><PrintButton/><CheckoutOperations db={db} date={q.date}/><p className="subtle">The 4:50 PM Daily Summary captures these totals and cleaner progress automatically. Previous reports retain their original snapshot.</p></AppShell>;
}
