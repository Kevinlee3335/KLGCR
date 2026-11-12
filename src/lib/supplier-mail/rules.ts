export const mailbox = 'klgresidenceenquiry@gmail.com';
export const startDate = '2023-01-01T00:00:00+08:00';
export const suppliers = {
  sigma: { name: 'Sigma' },
  mfe: { name: 'MFE' },
} as const;
export type Supplier = keyof typeof suppliers;
export const folders = ['Quotation', 'Invoice', 'Service Report', 'Agreement', 'Other Documents'] as const;
export type Folder = typeof folders[number];
export type SupplierSenderRule = { rule: string; supplier_id: string };
export const legacySenderRules: readonly SupplierSenderRule[] = [
  { rule: 'sigmamy.com', supplier_id: 'sigma' },
  { rule: 'mfetsb@gmail.com', supplier_id: 'mfe' },
];

export function isSupplierId(id: string) {
  return id.length <= 48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

export function supplierForSender(sender: string, rules: readonly SupplierSenderRule[] = legacySenderRules): string | null {
  if (/[\r\n]/.test(sender)) return null;
  const address = (sender.match(/^[^<>]*<([^<>]+)>\s*$/)?.[1] ?? sender).trim().toLowerCase();
  if (address.length > 254 || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(address)) return null;
  const exact = rules.find(({rule}) => rule === address);
  return exact?.supplier_id ?? rules.find(({rule}) => rule === address.split('@')[1])?.supplier_id ?? null;
}
export function classifyAttachment(filename: string, subject: string): Folder {
  // Prefer explicit filename evidence. Subject is only a fallback.
  for (const source of [filename, subject]) {
    const value = source.replaceAll('_', ' ');
    if (/\breceipt\b|\bstatement of account\b|\bdelivery order\b/i.test(value)) return 'Other Documents';
    if (/\binvoice\b|\binv[\s.-]?\d/i.test(value)) return 'Invoice';
    if (/quotation|\bquote\b|sebut harga|\b(?:sq|quo)[\s.-]?\d|\bq[-\s]wm[-\s]\d/i.test(value)) return 'Quotation';
    if (/\bagreement\b|\bcontract\b|\bperjanjian\b/i.test(value)) return 'Agreement';
    if (/servic(?:e|ing).*report|svrreport|inspection.*report|\bweekly.*report\b|\bklg\s+week\s+\d|certificate of analysis|\bcoa\b/i.test(value)) return 'Service Report';
  }
  return 'Other Documents';
}
export function inImportRange(date: string) {
  const time = Date.parse(date);
  return Number.isFinite(time) && time >= Date.parse(startDate) && time <= Date.now() + 5 * 60_000;
}
