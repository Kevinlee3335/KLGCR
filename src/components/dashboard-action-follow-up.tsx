import Link from 'next/link';
import {ArrowUpRight, Clock3} from 'lucide-react';
import styles from './monitoring-follow-up.module.css';

type Item={id:string;name:string;detail:string};
export function DashboardActionFollowUp({title,subtitle,count,items,href,action}:{title:string;subtitle:string;count:number;items:Item[];href:string;action:string}){
 if(!count)return null;
 return <section className={styles.panel} aria-label={title}>
  <header className={styles.header}><div className={styles.heading}><span className={styles.icon}><Clock3 size={20}/></span><div><span className={styles.eyebrow}>ACTION REQUIRED</span><h2>{title}</h2><p>{subtitle}</p></div></div><div className={styles.counts}><span><b>{count}</b> Awaiting action</span></div></header>
  <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Room / Name</th><th>Details</th><th>Status</th><th>Action</th><th><span className={styles.srOnly}>Open</span></th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong className={styles.room}>{item.name}</strong></td><td><p className={styles.defect}>{item.detail}</p></td><td><span className={`${styles.status} ${styles.today}`}><i/>Pending</span></td><td/><td><Link href={href} className={styles.action}>{action} <ArrowUpRight size={15}/></Link></td></tr>)}</tbody></table></div>
  <footer className={styles.footer}><span>Items remain here until handled.{count>items.length?' Showing the first '+items.length+'.':''}</span><Link href={href}>View all <ArrowUpRight size={14}/></Link></footer>
 </section>;
}
