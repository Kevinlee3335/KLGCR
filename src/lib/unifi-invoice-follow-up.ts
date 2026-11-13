import { listUnifiInvoices, type UnifiInvoice } from './unifi-invoices';
import { getUnifiWebmailConnectionStatus } from './unifi-webmail-connection';

const firstMonitoredPeriod = '2026-11';
const followUpDays = [
  { lineNumber: 1, day: 23 },
  { lineNumber: 2, day: 23 },
  { lineNumber: 3, day: 5 },
  { lineNumber: 4, day: 11 },
  { lineNumber: 5, day: 11 },
  { lineNumber: 6, day: 5 },
];
const malaysiaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
});
const malaysiaHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', hourCycle: 'h23',
});

type FollowUp = { period: string; lineNumber: number; followUpOn: string };
type Health = 'unconfirmed' | 'failed' | 'stale' | 'unavailable' | 'ready';
type ConnectionStatus = Awaited<ReturnType<typeof getUnifiWebmailConnectionStatus>>;
type ReceivedInvoice = Pick<UnifiInvoice, 'period' | 'line_number'>;

function previousMalaysiaDate(now: Date) {
  return malaysiaDate.format(new Date(now.getTime() - 86_400_000));
}

function nextPeriod(period: string) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
}

export function unifiWebmailFollowUpHealth(connection: ConnectionStatus, now: Date): Health {
  if (connection.lastError) return 'failed';
  if (!connection.connected || !connection.lastCheckedAt) return 'unconfirmed';
  const checked = new Date(connection.lastCheckedAt);
  if (!Number.isFinite(checked.getTime()) || checked > now) return 'unconfirmed';

  // The scheduled 09:00 check can arrive any time within that hour.
  const earliestCheck = Number(malaysiaHour.format(now)) >= 10
    ? malaysiaDate.format(now) : previousMalaysiaDate(now);
  return malaysiaDate.format(checked) < earliestCheck ? 'stale' : 'ready';
}

export function missingUnifiInvoices(invoices: ReceivedInvoice[], checkedAt: Date): FollowUp[] {
  const checkedOn = malaysiaDate.format(checkedAt);
  const received = new Set(invoices.map(invoice => `${invoice.period}/${invoice.line_number}`));
  const missing: FollowUp[] = [];

  for (let period = firstMonitoredPeriod; period <= checkedOn.slice(0, 7); period = nextPeriod(period)) {
    for (const { lineNumber, day } of followUpDays) {
      const followUpOn = `${period}-${String(day).padStart(2, '0')}`;
      if (followUpOn <= checkedOn && !received.has(`${period}/${lineNumber}`)) {
        missing.push({ period, lineNumber, followUpOn });
      }
    }
  }
  return missing.sort((a, b) => a.followUpOn.localeCompare(b.followUpOn) || a.lineNumber - b.lineNumber);
}

export async function getUnifiInvoiceFollowUp(): Promise<{ health: Health; missing: FollowUp[] }> {
  try {
    const connection = await getUnifiWebmailConnectionStatus();
    const health = unifiWebmailFollowUpHealth(connection, new Date());
    if (health !== 'ready' || !connection.lastCheckedAt) return { health, missing: [] };
    const invoices = await listUnifiInvoices();
    return { health, missing: missingUnifiInvoices(invoices, new Date(connection.lastCheckedAt)) };
  } catch {
    return { health: 'unavailable', missing: [] };
  }
}
