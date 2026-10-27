export const mailbox = 'klgresidenceenquiry@gmail.com';
export const startDate = '2023-01-01T00:00:00+08:00';
export const suppliers = {
  sigma: { name: 'Sigma', email: 'customercare.my@sigmamy.com', emails: ['customercare.my@sigmamy.com', 'intan.nursyuhada@sigmamy.com'] },
  mfe: { name: 'MFE', email: 'mfetsb@gmail.com', emails: ['mfetsb@gmail.com'] },
} as const;
export type Supplier = keyof typeof suppliers;
export const folders = ['Quotation', 'Invoice', 'Service Report', 'Other Documents'] as const;
export type Folder = typeof folders[number];
export function supplierForSender(sender: string): Supplier | null {
  const address = sender.match(/<([^<>]+)>\s*$/)?.[1] || sender.trim();
  if (/^[^@\s<>]+@sigmamy\.com$/i.test(address)) return 'sigma';
  return (Object.keys(suppliers) as Supplier[]).find(key => (suppliers[key].emails as readonly string[]).includes(address.toLowerCase())) || null;
}
export function classifyAttachment(filename: string, subject: string): Folder {
  // Prefer explicit filename evidence. Subject is only a fallback.
  for (const value of [filename, subject]) {
    if (/\binvoice\b|\binv[\s_-]?\d|\btax invoice\b/i.test(value)) return 'Invoice';
    if (/quotation|\bquote\b|sebut harga|\b(?:sq|quo)[\s_-]?\d/i.test(value)) return 'Quotation';
    if (/servic(?:e|ing).*report|svrreport|\bservice report\b|inspection.*report/i.test(value)) return 'Service Report';
  }
  return 'Other Documents';
}
export function inImportRange(date: string) {
  const time = Date.parse(date);
  return Number.isFinite(time) && time >= Date.parse(startDate) && time <= Date.now() + 5 * 60_000;
}
