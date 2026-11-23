import { describe, expect, it } from 'vitest';
import { missingUnifiInvoices, unifiWebmailFollowUpHealth } from './unifi-invoice-follow-up';

const ready = { connected: true, lastCheckedAt: '2026-11-23T01:34:00Z', lastError: null };
const novemberBills = [3, 4, 5, 6].map(line_number => ({ period: '2026-11', line_number }));

describe('Unifi invoice follow-up', () => {
  it('hides only the reviewed scan and keeps new errors and stale scans visible', () => {
    const now = new Date('2026-11-23T03:30:00Z');
    const checked = '2026-11-23T03:15:00Z';
    const reviewed = { ...ready, lastCheckedAt: checked, lastError: '2 invoice attachment(s) need manual review.',
      reviewedCheckAt: checked, reviewedError: '2 invoice attachment(s) need manual review.' };
    expect(unifiWebmailFollowUpHealth(reviewed, now)).toBe('reviewed');
    expect(unifiWebmailFollowUpHealth({ ...reviewed, reviewedCheckAt: '2026-11-23T11:15:00+08:00' }, now)).toBe('reviewed');
    expect(unifiWebmailFollowUpHealth({ ...reviewed, lastCheckedAt: '2026-11-23T03:20:00Z' }, now)).toBe('failed');
    expect(unifiWebmailFollowUpHealth({ ...reviewed, lastError: 'Could not check Webmail.' }, now)).toBe('failed');
    expect(unifiWebmailFollowUpHealth(reviewed, new Date('2026-11-24T02:00:00Z'))).toBe('failed');
    expect(unifiWebmailFollowUpHealth({ ...reviewed, lastError: null }, now)).toBe('ready');
  });
  it('uses Malaysia dates and flags Lines 1 and 2 starting on the 23rd', () => {
    expect(missingUnifiInvoices(novemberBills, new Date('2026-11-22T15:59:00Z'))).toEqual([]);
    expect(missingUnifiInvoices(novemberBills, new Date('2026-11-22T16:00:00Z'))).toEqual([
      { period: '2026-11', lineNumber: 1, followUpOn: '2026-11-23' },
      { period: '2026-11', lineNumber: 2, followUpOn: '2026-11-23' },
    ]);
  });

  it('uses each line schedule, carries unresolved months forward, and clears an imported bill', () => {
    const invoices = [...novemberBills, { period: '2026-11', line_number: 1 }, { period: '2026-12', line_number: 3 }];
    expect(missingUnifiInvoices(invoices, new Date('2026-12-11T01:00:00Z'))).toEqual([
      { period: '2026-11', lineNumber: 2, followUpOn: '2026-11-23' },
      { period: '2026-12', lineNumber: 6, followUpOn: '2026-12-05' },
      { period: '2026-12', lineNumber: 4, followUpOn: '2026-12-11' },
      { period: '2026-12', lineNumber: 5, followUpOn: '2026-12-11' },
    ]);
  });

  it('distinguishes unverified, incomplete and stale mailbox scans from a clean scan', () => {
    const morning = new Date('2026-11-24T01:59:00Z');
    const afterCheckWindow = new Date('2026-11-24T02:00:00Z');
    expect(unifiWebmailFollowUpHealth(ready, morning)).toBe('ready');
    expect(unifiWebmailFollowUpHealth(ready, afterCheckWindow)).toBe('stale');
    expect(unifiWebmailFollowUpHealth({ ...ready, lastCheckedAt: null }, morning)).toBe('unconfirmed');
    expect(unifiWebmailFollowUpHealth({ ...ready, lastError: 'Attachment needs manual review.' }, morning)).toBe('failed');
  });
});
