/** The customer inbox is separate from the outbound noreply account. */
export const PAYMENT_MAILBOX = 'klgresidenceenquiry@gmail.com';
export const PAYMENT_MAIL_MAX_BYTES = 10 * 1024 * 1024;
export const PAYMENT_MAIL_MAX_PARTS = 100;
export const PAYMENT_MAIL_PROTOCOL = 1;
export const PAYMENT_MAIL_HEARTBEAT_MS = 35 * 60 * 1000;
export const paymentMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type PaymentMimeType = typeof paymentMimeTypes[number];
export type PaymentContact = {kind: string; account_key: string; email: string};

// One exact mailbox only. Display names are never used to select a company.
export function normalizePaymentSender(value: string): {email: string; name: string} | null {
  if (!value || /[\r\n\0]/.test(value)) return null;
  const match = value.trim().match(/^(.*?)\s*<([^<>]+)>$/);
  const email = (match ? match[2] : value).trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)
    || email.length > 254 || email.includes('..')) return null;
  const name = (match?.[1] || '').trim().replace(/^"(.*)"$/, '$1');
  if (/[<>]/.test(name) || /(?:^|[,;])\s*[^\s]+@/.test(name)) return null;
  return {email, name: name.slice(0, 250)};
}

export function paymentSenderGroups(contacts: PaymentContact[]) {
  const groups = new Map<string, {email: string; accounts: {kind: 'rental' | 'utility'; account_key: string}[]}>();
  for (const contact of contacts) {
    const sender = normalizePaymentSender(contact.email);
    if (!sender || sender.name || !['rental', 'utility'].includes(contact.kind)) continue;
    const group = groups.get(sender.email) || {email: sender.email, accounts: []};
    if (!group.accounts.some(account => account.kind === contact.kind && account.account_key === contact.account_key)) {
      group.accounts.push({kind: contact.kind as 'rental' | 'utility', account_key: String(contact.account_key)});
    }
    groups.set(sender.email, group);
  }
  return [...groups.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export function inPaymentMailRange(receivedAt: string, enabledFrom: string, now = Date.now()) {
  const received = Date.parse(receivedAt), from = Date.parse(enabledFrom);
  return Number.isFinite(received) && Number.isFinite(from) && received >= from && received <= now + 5 * 60 * 1000;
}

export function paymentFileExtension(mimeType: PaymentMimeType) {
  return mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/jpeg' ? 'jpg' : 'png';
}

export function paymentFileMagic(bytes: Uint8Array, mimeType: PaymentMimeType) {
  if (mimeType === 'application/pdf') return Buffer.from(bytes.subarray(0, 1024)).includes(Buffer.from('%PDF-'));
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
}

/** Keep inline screenshots. Skip only recognizable small signature/branding images. */
export function isObviousPaymentMailLogo(filename: string, size: number, inline: boolean) {
  return inline && size <= 30_000 && /^(?:logo|signature|facebook|instagram|linkedin|twitter|whatsapp|icon|spacer|tracking)(?:[_. -]|\d|$)/i.test(filename);
}

export function connectionReady(lastChecked: string | null, lastError: string | null, now = Date.now()) {
  const checked = lastChecked ? Date.parse(lastChecked) : NaN;
  return !lastError && Number.isFinite(checked) && checked <= now + 5 * 60 * 1000 && now - checked <= PAYMENT_MAIL_HEARTBEAT_MS;
}
