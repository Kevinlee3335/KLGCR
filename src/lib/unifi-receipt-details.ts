export function isUnifiReceiptSubject(subject: string) {
  return /\b(?:e[- ]?receipt|receipt|payment (?:is |was )?(?:received|confirmation|successful|acknowledg(?:e)?ment)|successful payment|thank you for (?:your )?payment)\b/i.test(subject);
}

export function unifiEmailText(html: string) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/tr)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity.toLowerCase()] || ' ')
    .replace(/[\t ]+/g, ' ').trim();
}

function paymentDate(value: string, dayFirst = false) {
  const normalized = value.replace(/,/g, '').trim();
  let iso: string | undefined;
  const machine = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  const named = normalized.match(/^(\d{1,2})[\s-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s-]+(\d{4})\b/i);
  const numeric = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (machine) iso = `${machine[1]}-${machine[2].padStart(2, '0')}-${machine[3].padStart(2, '0')}`;
  else if (named) {
    const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(named[2].slice(0,3).toLowerCase()) + 1;
    iso = `${named[3]}-${String(month).padStart(2,'0')}-${named[1].padStart(2,'0')}`;
  } else if (numeric && (dayFirst || Number(numeric[1]) > 12) && Number(numeric[2]) <= 12) {
    iso = `${numeric[3]}-${numeric[2].padStart(2,'0')}-${numeric[1].padStart(2,'0')}`;
  }
  return iso && Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0,10) === iso ? iso : null;
}

export function unifiReceiptDetails(text: string) {
  const normalized = text.normalize('NFKC');
  // Unifi's observed receipt template labels Billing Account and uses DD-MM-YYYY.
  const unifiTemplate = /\bbilling account\s+\d{10}\b/i.test(normalized)
    && /\breceipt\s+A(?:P)?\d{8,}\b/i.test(normalized) && /\bpaid amount\b/i.test(normalized);
  const accounts = [...new Set([...normalized.matchAll(/\baccount\s*(?:no\.?|number)?\s*[:#-]?\s*(\d{10})\b/gi)].map(match => match[1]))];
  const dates = [...new Set([...normalized.matchAll(/\b(?:(?:payment|transaction|receipt)\s+date|paid\s+on|payment\s+on|date\s+of\s+payment)\s*[:#-]?\s*([^\n]{4,40})/gi)]
    .map(match => paymentDate(match[1], unifiTemplate)).filter((date): date is string => Boolean(date)))];
  const amount = normalized.match(/\b(?:payment amount|amount paid|paid amount|amount received|total payment|amount)\s*[:=-]?\s*(?:RM|MYR)\s*([\d,]+\.\d{2})\b/i)?.[1];
  const receiptNumber = normalized.match(/\b(?:receipt\s*(?:no\.?|number)|(?:payment |transaction )?(?:reference|ref\.?|id))\s*[:#]\s*([a-z0-9][a-z0-9/-]{3,80})\b/i)?.[1] ?? normalized.match(/\breceipt\s+(A(?:P)?\d{8,})\b/i)?.[1] ?? null;
  return {
    account_number: accounts.length === 1 ? accounts[0] : null,
    payment_date: dates.length === 1 ? dates[0] : null,
    amount: amount ? Number(amount.replace(/,/g,'')) : null,
    receipt_number: receiptNumber,
    invoice_references: [...new Set([...normalized.matchAll(/\bINV\d+\b/gi)].map(match => match[0].toUpperCase()))],
    confirmed: !/\b(?:payment|transaction)\s*(?:status\s*[:=-]?\s*|is\s+|was\s+)?(?:failed|unsuccessful|pending|scheduled|reversed|rejected)\b/i.test(normalized),
  };
}

type MatchInvoice = { id: string; account_number: string | null; invoice_number: string | null; received_at: string | null; due_date: string | null };
type ReceiptEvidence = ReturnType<typeof unifiReceiptDetails>;
export function matchUnifiReceipt(receipt: ReceiptEvidence, invoices: MatchInvoice[]) {
  if (!receipt.confirmed) return null;
  const byAccount = invoices.filter(invoice => invoice.account_number && invoice.account_number === receipt.account_number);
  if (receipt.invoice_references.length) {
    if (receipt.invoice_references.length !== 1) return null;
    const matching = invoices.filter(invoice => invoice.invoice_number === receipt.invoice_references[0]
      && (!receipt.account_number || invoice.account_number === receipt.account_number));
    return matching.length === 1 ? matching[0].id : null;
  }
  if (!receipt.account_number || !receipt.payment_date) return null;
  const matching = byAccount.filter(invoice => invoice.received_at && invoice.due_date
    && new Date(new Date(invoice.received_at).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0,10) <= receipt.payment_date!
    && receipt.payment_date! <= invoice.due_date);
  return matching.length === 1 ? matching[0].id : null;
}

export function unifiPaymentCheckDate(dueDate: string) {
  return new Date(Date.parse(dueDate + 'T00:00:00Z') - 7 * 86_400_000).toISOString().slice(0,10);
}
export function unifiPaymentFollowups<T extends { id: string; period: string; due_date: string | null }>(
  invoices: T[], receipts: { invoice_id: string | null }[], now = new Date(),
) {
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0,10);
  const received = new Set(receipts.map(receipt => receipt.invoice_id).filter(Boolean));
  return invoices.filter(invoice => invoice.period >= '2026-11' && invoice.due_date
    && unifiPaymentCheckDate(invoice.due_date) <= today && !received.has(invoice.id))
    .sort((a,b) => a.due_date!.localeCompare(b.due_date!));
}
