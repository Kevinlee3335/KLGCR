import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';

const calendarMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const categories = {
  certificate_license: /^CERT\s*&\s*LICENSE\s*\(/i,
  servicing: /^SERVICING(?:\s+\d{4})?\s*\(/i,
};

const tidy = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const normalize = (value) => tidy(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/\bservices\b/g, 'service').replace(/fire\s*fighting/g, 'firefighting')
  .replace(/\bextingushers\b/g, 'extinguishers').replace(/\bextinguishers\b/g, 'extinguisher')
  .replace(/\((?:monthly|quarterly|quaterly|yearly|every \d+ months?)\)/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

function isoDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger) || year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function expandedYear(value) {
  const year = Number(value);
  return value.length === 2 ? 2000 + year : year;
}

export function readDueDate(value, date1904 = false) {
  if (typeof value === 'number') {
    const parts = XLSX.SSF.parse_date_code(value, { date1904 });
    return parts ? isoDate(parts.y, parts.m, parts.d) : null;
  }
  const text = tidy(value);
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (match) return isoDate(expandedYear(match[3]), Number(match[2]), Number(match[1]));
  const monthFirst = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})$/i);
  const dayFirst = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s*(\d{4})$/i);
  if (!monthFirst && !dayFirst) return null;
  const [month, day, year] = monthFirst ? monthFirst.slice(1) : [dayFirst[2], dayFirst[1], dayFirst[3]];
  const monthIndex = calendarMonths.findIndex((name) => name === month.toLowerCase() || name.slice(0, 3) === month.toLowerCase());
  return isoDate(Number(year), monthIndex + 1, Number(day));
}

function snapshotDate(name) {
  const digits = name.match(/\((\d{6,8})\)(?:\s*\(\d+\))?$/)?.[1];
  if (!digits) return null;
  const yearDigits = digits.length === 6 ? 2 : 4;
  const year = expandedYear(digits.slice(-yearDigits));
  const rest = digits.slice(0, -yearDigits);
  return isoDate(year, Number(rest.slice(-2)), Number(rest.slice(0, -2)));
}

function findSheets(workbook, type) {
  return workbook.SheetNames.filter((name) => categories[type].test(name)).flatMap((name) => {
    const date = snapshotDate(name);
    return date ? [{ name, date, sheet: workbook.Sheets[name] }] : [];
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function worksheet(source) {
  const { sheet } = source;
  const merges = sheet['!merges'] ?? [];
  const lastRow = XLSX.utils.decode_range(sheet['!ref']).e.r + 1;
  const own = (column, row) => sheet[`${column}${row}`]?.v;
  const range = (column, row) => {
    const col = XLSX.utils.decode_col(column);
    return merges.find((item) => item.s.c === col && item.e.c === col && item.s.r <= row - 1 && item.e.r >= row - 1);
  };
  const value = (column, row) => {
    const anchor = range(column, row)?.s.r;
    return own(column, anchor === undefined ? row : anchor + 1);
  };
  const headerRow = Array.from({ length: Math.min(lastRow, 12) }, (_, index) => index + 1).find((row) => (
    /^no\.?$/i.test(tidy(own('A', row))) && /^type$/i.test(tidy(own('B', row))) && /due date/i.test(tidy(own('D', row)))
  ));
  if (!headerRow) throw new Error(`Missing the expected worksheet headings in ${source.name}`);
  return { own, value, range, lastRow, start: (range('B', headerRow)?.e.r ?? headerRow - 1) + 2,
    hidden: (row) => Boolean(sheet['!rows']?.[row - 1]?.hidden) };
}

function contactAt(layout, row) {
  return { contact_name: tidy(layout.value('F', row)) || null, contact_phone: tidy(layout.value('G', row)) || null,
    contact_email: tidy(layout.value('H', row)) || null };
}

function noteDates(note) {
  if (!/\b(done|completed|carried out|serviced)\b/i.test(note) || /\b(?:not done|not completed|to be done|payment (?:has )?(?:been )?done)\b/i.test(note)) return [];
  return [...new Set([...note.matchAll(/\b\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})\b/g)].map(([date]) => readDueDate(date)).filter(Boolean))];
}

function cycleAt(layout, source, row, date1904, subtitle = null) {
  const raw = layout.value('D', row);
  const notes = tidy(layout.value('E', row)) || null;
  const due = readDueDate(raw, date1904);
  return { due_date: due, notes, template_row: row, source_sheet: source.name,
    source_snapshot_date: source.date, hidden: layout.hidden(row), subtitle,
    date_cell: `D${(layout.range('D', row)?.s.r ?? row - 1) + 1}`,
    shared_due_cell: Boolean(layout.range('D', row) && layout.range('D', row).e.r > layout.range('D', row).s.r),
    due_text: !due && tidy(raw) ? tidy(raw) : null,
    reported_performed_dates: noteDates(notes ?? '') };
}

function certEvidence(group, section) {
  if (/extinguisher/i.test(group ?? '')) return ['certificate', 'invoice'];
  if (/agreement|contract/i.test(section ?? '')) return ['agreement'];
  return ['certificate'];
}

function parseCertificates(source, date1904) {
  const layout = worksheet(source);
  const rows = [];
  let group = null;
  let section = null;
  for (let row = layout.start; row <= layout.lastRow; row++) {
    const label = tidy(layout.own('B', row));
    const marker = tidy(layout.own('A', row));
    if (!label) {
      if (marker && !/^\d+$/.test(marker)) section = marker;
      continue;
    }
    if (label.endsWith(':') && !tidy(layout.value('D', row))) {
      group = { title: label.slice(0, -1).trim(), through: (layout.range('C', row)?.e.r ?? row - 1) + 1 };
      continue;
    }
    if (group && row > group.through) group = null;
    const place = group ? label.replace(/^[a-z]\)\s*/i, '') : null;
    rows.push({ record_type: 'certificate_license', title: group ? `${group.title} – ${place}` : label,
      location: place, provider: tidy(layout.value('C', row)) || null, ...contactAt(layout, row),
      frequency: null, required_evidence: certEvidence(group?.title, section), template_row: row,
      source_sheet: source.name, section, source_title: label, cycles: [cycleAt(layout, source, row, date1904)] });
  }
  return rows;
}

function serviceFrequency(title) {
  return title.match(/\((monthly|quarterly|quaterly|yearly|every \d+ months?)\)/i)?.[1] ?? (/^yearly\b/i.test(title) ? 'Yearly' : null);
}

function serviceEvidence(provider) {
  if (!provider || /^(?:k hotel|hk team|maintenance team|mr\.?\s|ms\.?\s)/i.test(provider)) return [];
  return ['service_report'];
}

function parseServicing(source, date1904) {
  const layout = worksheet(source);
  const rows = [];
  const unboundRows = [];
  for (let row = layout.start; row <= layout.lastRow; row++) {
    const title = tidy(layout.own('B', row));
    if (!title) {
      if (tidy(layout.own('D', row)) || tidy(layout.own('E', row))) unboundRows.push(cycleAt(layout, source, row, date1904));
      continue;
    }
    const endTitle = (layout.range('B', row)?.e.r ?? row - 1) + 1;
    const numberedRange = layout.range('A', row);
    const nextIsVisit = /^[a-z]\)\s/i.test(tidy(layout.own('B', row + 1)));
    const end = nextIsVisit && numberedRange?.s.r === row - 1 ? numberedRange.e.r + 1 : endTitle;
    const provider = tidy(layout.value('C', row)) || null;
    const templateRow = row;
    const cycles = [];
    for (; row <= end; row++) {
      const subtitle = row === templateRow ? null : tidy(layout.own('B', row)) || null;
      const cycle = cycleAt(layout, source, row, date1904, subtitle);
      if (cycle.due_date || cycle.due_text || cycle.notes || end === templateRow) cycles.push(cycle);
    }
    row--;
    rows.push({ record_type: 'servicing', title, location: null, provider, ...contactAt(layout, templateRow),
      frequency: serviceFrequency(title), required_evidence: serviceEvidence(provider), template_row: templateRow,
      source_sheet: source.name, cycles });
  }
  return { rows, unboundRows };
}

function parseAgreements(source, date1904) {
  const layout = worksheet(source);
  const rows = [];
  for (let row = layout.start; row <= layout.lastRow; row++) {
    const provider = tidy(layout.own('B', row));
    const service = tidy(layout.own('C', row));
    if (!provider && !service) continue;
    rows.push({ record_type: 'agreement', title: [provider, service].filter(Boolean).join(' – '), provider: provider || null,
      location: null, ...contactAt(layout, row), frequency: null, required_evidence: ['agreement'], template_row: row,
      source_sheet: source.name, cycles: [cycleAt(layout, source, row, date1904)] });
  }
  return rows;
}

function latestProposedCycle(record) {
  if (record.record_type !== 'servicing') return record.cycles[0];
  return record.cycles.filter((cycle) => !cycle.hidden && cycle.due_date && !cycle.reported_performed_dates.length)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.template_row - b.template_row)[0] ?? null;
}

function mergeServiceCycles(cycles) {
  const known = new Map();
  const unique = [];
  for (const cycle of cycles) {
    const key = cycle.due_date && `${cycle.due_date}/${normalize(cycle.subtitle)}`;
    const existing = key ? known.get(key) : null;
    if (existing) {
      existing.alternate_source_rows.push(cycle.template_row);
      if (cycle.notes && cycle.notes !== existing.notes && !existing.alternate_notes.includes(cycle.notes)) existing.alternate_notes.push(cycle.notes);
      existing.reported_performed_dates = [...new Set([...existing.reported_performed_dates, ...cycle.reported_performed_dates])];
      if (existing.hidden && !cycle.hidden) {
        const oldRow = existing.template_row;
        Object.assign(existing, { template_row: cycle.template_row, date_cell: cycle.date_cell, hidden: false });
        existing.alternate_source_rows = existing.alternate_source_rows.filter((row) => row !== cycle.template_row).concat(oldRow);
      }
    } else {
      const item = { ...cycle, alternate_source_rows: [], alternate_notes: [] };
      unique.push(item);
      if (key) known.set(key, item);
    }
  }
  return unique;
}

function titleSimilarity(a, b) {
  const left = new Set(normalize(a).split(' ').filter(Boolean));
  const right = new Set(normalize(b).split(' ').filter(Boolean));
  const overlap = [...left].filter((token) => right.has(token)).length;
  return (2 * overlap) / Math.max(1, left.size + right.size);
}

function candidateMatches(record, existing) {
  const title = normalize(record.title);
  const provider = normalize(record.provider);
  return existing.filter((row) => row.record_type === record.record_type || (record.record_type === 'agreement' && row.record_type === 'certificate_license'))
    .flatMap((row) => {
      const titleScore = titleSimilarity(row.title, title);
      const sameProvider = Boolean(provider && provider === normalize(row.provider));
      if (titleScore < 0.48 && !(sameProvider && titleScore >= 0.35)) return [];
      return [{ id: row.id, title: row.title, provider: row.provider, record_type: row.record_type, next_due_date: row.next_due_date,
        same_title: title === normalize(row.title), same_provider: sameProvider,
        score: Number((titleScore + (sameProvider ? 0.15 : 0)).toFixed(3)) }];
    }).sort((a, b) => b.score - a.score).slice(0, 3);
}

function reviewRecord(record, existing, suppliers) {
  const current = latestProposedCycle(record);
  const candidates = candidateMatches(record, existing);
  const exact = candidates.filter((item) => item.same_title && item.same_provider && item.record_type === record.record_type);
  const matched = exact.length === 1 ? exact[0] : null;
  const provider = ` ${normalize(record.provider)} `;
  const supplierCandidates = suppliers.filter((supplier) => supplier.id && normalize(supplier.name) && provider.includes(` ${normalize(supplier.name)} `));
  const flags = [];
  if (!current?.due_date) flags.push('no_confirmed_due_date');
  if (matched && matched.next_due_date !== current?.due_date) flags.push('existing_due_differs');
  if (!matched && candidates.length) flags.push('possible_duplicate_or_different_scope');
  if (record.cycles.some((cycle) => cycle.shared_due_cell)) flags.push('shared_template_due_cell');
  if (record.cycles.some((cycle) => cycle.due_text)) flags.push('incomplete_or_unrecognized_date_text');
  if (record.cycles.some((cycle) => cycle.alternate_notes?.length)) flags.push('repeated_schedule_date_with_different_notes');
  if (record.cycles.some((cycle) => cycle.reported_performed_dates.length)) flags.push('workbook_reported_work_requires_confirmation');
  if (record.previous_expiries?.length) flags.push('earlier_expiry_dates_are_not_proof_of_completion');
  if (record.cycles.every((cycle) => cycle.hidden)) flags.push('only_hidden_rows');
  if (supplierCandidates.length > 1) flags.push('multiple_possible_supplier_archives');
  return { ...record, proposed_current_due: current?.due_date ?? null, proposed_current_template_row: current?.template_row ?? null,
    existing_record_id: matched?.id ?? null, supplier_key_candidate: supplierCandidates.length === 1 ? supplierCandidates[0].id : null,
    supplier_candidates: supplierCandidates, candidates, flags };
}

function findCrossSheetContracts(records) {
  const certificates = records.filter((record) => record.record_type === 'certificate_license' && /agreement|contract/i.test(record.section ?? ''));
  const agreements = records.filter((record) => record.record_type === 'agreement');
  const modelNumbers = (title) => [...normalize(title).matchAll(/\b[a-z]*(\d{3,8})[a-z]*\b/g)].map((match) => match[1]);
  for (const certificate of certificates) {
    const provider = normalize(certificate.provider);
    const models = modelNumbers(certificate.title);
    if (!provider || !models.length) continue;
    for (const agreement of agreements) {
      const agreementProvider = normalize(agreement.provider);
      if (agreementProvider !== provider && !agreementProvider.startsWith(`${provider} `)) continue;
      if (!modelNumbers(agreement.title).some((number) => models.includes(number))) continue;
      for (const [record, counterpart] of [[certificate, agreement], [agreement, certificate]]) {
        record.cross_sheet_contracts ??= [];
        record.cross_sheet_contracts.push({ source_sheet: counterpart.source_sheet, template_row: counterpart.template_row,
          title: counterpart.title, due_date: counterpart.proposed_current_due });
        if (!record.flags.includes('possible_contract_in_both_sheets')) record.flags.push('possible_contract_in_both_sheets');
      }
    }
  }
}

export function planWorkbookImport(workbook, existing, suppliers = []) {
  if (!Array.isArray(existing) || !Array.isArray(suppliers)) throw new Error('The production comparison and supplier inputs must be arrays.');
  const datesFrom1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  const certs = findSheets(workbook, 'certificate_license');
  const [servicing] = findSheets(workbook, 'servicing');
  const agreement = workbook.SheetNames.find((name) => /^agreement renewal$/i.test(name.trim()));
  if (!certs.length || !servicing || !agreement) throw new Error('Expected dated Cert & License and Servicing worksheets and an Agreement Renewal worksheet.');

  const previous = new Map();
  for (const snapshot of certs.slice(1)) {
    for (const record of parseCertificates(snapshot, datesFrom1904)) {
      const key = normalize(record.title);
      const cycle = record.cycles[0];
      if (!cycle?.due_date) continue;
      const previousDates = previous.get(key) ?? new Map();
      if (!previousDates.has(cycle.due_date)) previousDates.set(cycle.due_date, cycle);
      previous.set(key, previousDates);
    }
  }
  const certificateRows = parseCertificates(certs[0], datesFrom1904).map((record) => ({ ...record,
    previous_expiries: [...(previous.get(normalize(record.title))?.values() ?? [])].filter((cycle) => cycle.due_date !== record.cycles[0].due_date)
      .sort((a, b) => a.source_snapshot_date.localeCompare(b.source_snapshot_date)) }));
  const service = parseServicing(servicing, datesFrom1904);
  const rows = [...certificateRows, ...service.rows.map((record) => ({ ...record, cycles: mergeServiceCycles(record.cycles) })),
    ...parseAgreements({ name: agreement, sheet: workbook.Sheets[agreement], date: null }, datesFrom1904)];
  const records = rows.map((record) => reviewRecord(record, existing, suppliers));
  findCrossSheetContracts(records);
  const claimed = new Map();
  for (const record of records) {
    if (!record.existing_record_id) continue;
    const matches = claimed.get(record.existing_record_id) ?? [];
    matches.push(record);
    claimed.set(record.existing_record_id, matches);
  }
  for (const matches of claimed.values()) {
    if (matches.length < 2) continue;
    for (const record of matches) {
      record.existing_record_id = null;
      record.flags.push('same_existing_record_claimed_by_multiple_rows');
    }
  }
  const matchedIds = new Set(records.map((record) => record.existing_record_id));
  return { requires_admin_review: true, source_sheets: { certificate_license: certs[0].name, servicing: servicing.name, agreement },
    records, unbound_servicing_rows: service.unboundRows, existing_without_exact_match: existing.filter((row) => !matchedIds.has(row.id)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [workbookPath, existingPath, supplierPath] = process.argv.slice(2);
  if (!workbookPath || !existingPath) throw new Error('Usage: node scripts/compliance-workbook-plan.mjs <workbook.xlsx> <production-records.json> [suppliers.json]');
  const workbook = XLSX.readFile(workbookPath, { cellDates: false, cellStyles: true });
  const existing = JSON.parse(readFileSync(existingPath, 'utf8'));
  const suppliers = supplierPath ? JSON.parse(readFileSync(supplierPath, 'utf8')) : [];
  console.log(JSON.stringify(planWorkbookImport(workbook, existing, suppliers), null, 2));
}
