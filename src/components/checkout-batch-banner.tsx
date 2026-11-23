import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {activeCheckoutBatch} from '@/lib/checkout-batches.server';
import {CheckoutBatchClose} from './checkout-batch-close';
import {batchDate} from '@/lib/checkout-batches';
import styles from './checkout-batches.module.css';
export async function CheckoutBatchBanner({canManage}:{canManage:boolean}){try{const batch=await activeCheckoutBatch(await createClient());return <section className={styles.panel}><div className={styles.head}><div><p className="eyebrow">Current check-out batch</p><h3>{batch?.batch_no||'No active batch'}</h3><p>{batch?`Started ${batchDate(batch.started_at)}`:'A batch starts when new rooms are added.'}{batch?.state==='closing'?' · Reports in progress; retry to finish.':''}</p></div><div className={styles.links}><Link className="button secondary" href="/admin/checkouts/batches">Batch History</Link>{batch&&<Link className="button secondary" href={`/admin/checkouts/batches/${batch.id}`}>View Batch Details</Link>}{canManage&&batch&&<CheckoutBatchClose batchId={batch.id} resume={batch.state==='closing'}/>}</div></div></section>;}catch{return <p className="error">Unable to load the check-out batch. Please refresh.</p>;}}
