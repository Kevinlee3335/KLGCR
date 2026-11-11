import Link from 'next/link';
import { ArrowUpRight, Clock3 } from 'lucide-react';
import styles from './monitoring-follow-up.module.css';

type Item = {
  id: string;
  name: string;
  detail: string;
  href?: string;
  meta?: string;
};

type Props = {
  title: string;
  subtitle: string;
  count: number;
  items: Item[];
  href: string;
  action: string;
  nameColumn?: string;
  detailColumn?: string;
  metaColumn?: string;
};

export function DashboardActionFollowUp({
  title, subtitle, count, items, href, action,
  nameColumn = 'Room / Name', detailColumn = 'Details', metaColumn = 'Action',
}: Props) {
  if (!count) return null;

  return (
    <section className={styles.panel} aria-label={title}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.icon}><Clock3 size={20} aria-hidden="true" /></span>
          <div>
            <span className={styles.eyebrow}>ACTION REQUIRED</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className={styles.counts}><span><b>{count}</b> Awaiting action</span></div>
      </header>
      <div className={styles.scroll} role="group" aria-label="Pending items" tabIndex={0}>
        <table className={`${styles.table} ${styles.mobileRows}`}>
          <thead>
            <tr>
              <th scope="col">{nameColumn}</th>
              <th scope="col">{detailColumn}</th>
              <th scope="col">Status</th>
              <th scope="col">{metaColumn}</th>
              <th scope="col"><span className={styles.srOnly}>Open</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td><strong className={styles.room}>{item.name}</strong></td>
                <td><p className={styles.defect}>{item.detail}</p></td>
                <td data-label="Status"><span className={`${styles.status} ${styles.today}`}><i />Pending</span></td>
                <td data-label={metaColumn} className={item.meta ? undefined : styles.emptyCell}>{item.meta && <span className={styles.staff}>{item.meta}</span>}</td>
                <td>
                  <Link href={item.href || href} className={styles.action}>
                    {action} <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className={styles.footer}>
        <span>Items remain here until handled.{count > items.length ? ` Showing the first ${items.length}.` : ''}</span>
        <Link href={href}>View all <ArrowUpRight size={14} aria-hidden="true" /></Link>
      </footer>
    </section>
  );
}
