import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {batchColumns} from '@/lib/checkout-batches.server';
import {batchDate,type BatchRecord} from '@/lib/checkout-batches';
import styles from './checkout-batches.module.css';
export async function CheckoutBatchHistory(){const db=await createClient();const batches:BatchRecord[]=[];for(let offset=0;;offset+=100){const {data,error}=await db.from('checkout_batches').select(batchColumns).order('sequence_no',{ascending:false}).range(offset,offset+99);if(error)return <p className="error">Unable to load batches. Please refresh.</p>;batches.push(...data as BatchRecord[]);if(data.length<100)break;}
 return <div className={styles.folderList}>{batches.map(b=><section className={styles.panel} key={b.id}><div className={styles.head}><div><p className="eyebrow">{b.state==='closed'?'Archived batch':b.state==='closing'?'Reports in progress':'Current batch'}</p><h3>{b.batch_no}</h3><p>{batchDate(b.started_at)} {b.closed_at?' to '+batchDate(b.closed_at):''}</p></div><div className={styles.links}><Link className="button" href={`/admin/checkouts/batches/${b.id}`}>View Full Details</Link>{b.state==='closed'&&<><a className="button secondary" href={`/api/checkouts/batches/${b.id}/report?kind=summary&preview=1`} target="_blank" rel="noopener">Summary PDF</a><a className="button secondary" href={`/api/checkouts/batches/${b.id}/report?kind=details&preview=1`} target="_blank" rel="noopener">Full Report PDF</a></>}</div></div></section>)}{!batches.length&&<p>No batches yet.</p>}</div>;
}
