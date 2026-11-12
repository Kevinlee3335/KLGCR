import { posix } from 'node:path';
import { CFB, read, SSF, utils, type WorkSheet } from 'xlsx';

export const compliancePrintBucket = 'compliance-print-templates';
export const compliancePrintPath = 'current.xlsx';
export const compliancePrintMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const compliancePrintMaxBytes = 3 * 1024 * 1024;
export const compliancePrintRecordFields = 'title,next_due_date,notes,template_row,compliance_cycles(template_row,due_date,notes,status,completed_at)';

export const compliancePrintKinds = {
  certificate_license: { label: 'Cert & License', filename: 'KLGCR-Cert-and-License.xlsx', sheet: 'CERT & LICENSE' },
  servicing: { label: 'Servicing', filename: 'KLGCR-Servicing.xlsx', sheet: 'SERVICING' },
  agreement: { label: 'Agreement Renewal', filename: 'KLGCR-Agreements.xlsx', sheet: 'AGREEMENT RENEWAL' },
} as const;

export type CompliancePrintKind = keyof typeof compliancePrintKinds;
export type CompliancePrintRecord = {
  title: string;
  next_due_date: string | null;
  notes: string | null;
  template_row: number | null;
};
export type CompliancePrintMaster = CompliancePrintRecord & {
  compliance_cycles?: {
    template_row: number | null;
    due_date: string | null;
    notes: string | null;
    status: string;
    completed_at: string | null;
  }[];
};
export type CompliancePrintCoverage = {
  kind: CompliancePrintKind;
  sheetName: string | null;
  unmapped: string[];
  error: string | null;
};

type Tab = { name: string; path: string; index: number };
type Archive = ReturnType<typeof CFB.read>;
type CellValue = string | number;
type CellChange = { value: CellValue; sourceRow: number };

export function isCompliancePrintKind(value: string | null): value is CompliancePrintKind {
  return value !== null && Object.hasOwn(compliancePrintKinds, value);
}

export function printRecords(kind: CompliancePrintKind, masters: CompliancePrintMaster[]): CompliancePrintRecord[] {
  return masters.flatMap((master) => {
    const cycles = master.compliance_cycles ?? [];
    const open = cycles.find(({ status }) => status === 'open');
    const { title, next_due_date, notes, template_row } = master;
    const current = { title, next_due_date, notes: open?.notes ?? notes, template_row };
    if (kind !== 'servicing') return [current];

    const byRow = new Map<number, CompliancePrintRecord>();
    for (const cycle of [...cycles].sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))) {
      if (cycle.status !== 'completed' || cycle.template_row === null) continue;
      byRow.set(cycle.template_row, {
        title, next_due_date: cycle.due_date, notes: cycle.notes, template_row: cycle.template_row,
      });
    }
    const currentRow = open?.template_row ?? template_row;
    if (open?.template_row !== null && open?.template_row !== undefined) {
      byRow.set(open.template_row, { ...current, template_row: open.template_row });
      return [...byRow.values()];
    }
    if (currentRow !== null && byRow.has(currentRow)) {
      // A new servicing period needs its own row when the previous period already occupies this one.
      return [...byRow.values(), ...(open ? [{ ...current, template_row: null }] : [])];
    }
    return [...byRow.values(), current];
  });
}

function xmlText(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);
}

function decodeXml(text: string) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (match) => {
    const code = match.slice(1, -1);
    if (code.startsWith('#')) {
      const point = /^#x/i.test(code) ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[code] ?? match;
  });
}

function attributes(tag: string) {
  return Object.fromEntries(Array.from(tag.matchAll(/([\w:.-]+)=(["'])(.*?)\2/g), ([, key, , value]) => [key, decodeXml(value)]));
}

function setAttribute(tag: string, key: string, value: string) {
  const pattern = new RegExp(`\\s${key}=(["'])[^"']*\\1`);
  const attribute = ` ${key}="${xmlText(value)}"`;
  return pattern.test(tag) ? tag.replace(pattern, attribute) : tag.replace(/\/?>(?=$)/, (end) => attribute + end);
}

function readPart(archive: Archive, path: string) {
  const file = CFB.find(archive, 'Root Entry/' + path);
  if (!file?.content) throw new Error('Required worksheet data is missing from the Excel file.');
  return Buffer.from(file.content).toString('utf8');
}

function replacePart(archive: Archive, path: string, content: string) {
  const file = CFB.find(archive, 'Root Entry/' + path);
  if (!file) throw new Error('Required worksheet data is missing from the Excel file.');
  file.content = Buffer.from(content);
  file.size = file.content.byteLength;
}

function openTemplate(bytes: Buffer) {
  if (bytes.length > compliancePrintMaxBytes || bytes.subarray(0, 4).toString('hex') !== '504b0304') {
    throw new Error('Upload an Excel .xlsx file within the template file size limit.');
  }
  const archive = CFB.read(bytes, { type: 'buffer' });
  if (archive.FileIndex.reduce((size: number, file: { size?: number }) => size + (file.size ?? 0), 0) > 40 * 1024 * 1024) {
    throw new Error('The Excel file expands beyond the template file size limit.');
  }
  const workbook = readPart(archive, 'xl/workbook.xml');
  const relationships = readPart(archive, 'xl/_rels/workbook.xml.rels');
  const sheets = new Map(Array.from(relationships.matchAll(/<Relationship\s[^>]*\/>/g), ([tag]) => {
    const attrs = attributes(tag);
    const path = attrs.Type?.endsWith('/worksheet') && attrs.TargetMode !== 'External' && attrs.Target
      ? posix.resolve('/xl', attrs.Target).slice(1) : '';
    return [attrs.Id, path];
  }));
  const tabs = Array.from(workbook.matchAll(/<sheet\s[^>]*\/>/g), ([tag], index) => {
    const attrs = attributes(tag);
    return { name: attrs.name ?? '', path: sheets.get(attrs['r:id']) ?? '', index };
  }).filter(({ path }) => path.startsWith('xl/worksheets/'));
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(workbook);
  return { archive, workbook, tabs, date1904 };
}

function tabDate(name: string, baseName: string) {
  const normalized = name.trim().toUpperCase();
  if (normalized === baseName) return 0;
  if (!normalized.startsWith(baseName + ' ')) return -1;
  const date = normalized.slice(baseName.length).trim().match(/^\((\d{2})(\d{2})(\d{2}|\d{4})\)$/);
  if (!date) return -1;
  const [, day, month, year] = date;
  const iso = `${year.length === 2 ? '20' + year : year}-${month}-${day}`;
  const time = Date.parse(iso);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(iso) ? time : -1;
}

function findTab(tabs: Tab[], kind: CompliancePrintKind) {
  const { sheet } = compliancePrintKinds[kind];
  return tabs.map((tab) => ({ tab, date: tabDate(tab.name, sheet) }))
    .filter(({ date }) => date >= 0)
    .sort((a, b) => b.date - a.date || a.tab.index - b.tab.index)[0]?.tab;
}

function worksheet(bytes: Buffer, tab: Tab) {
  const sheet = read(bytes, { type: 'buffer', sheets: tab.name, cellNF: true, cellDates: false, sheetStubs: true }).Sheets[tab.name];
  if (!sheet?.['!ref']) throw new Error('The selected worksheet is empty.');
  return sheet;
}

function cellText(sheet: WorkSheet, row: number, col: string) {
  return String(sheet[col + row]?.v ?? '').trim();
}

function layoutHeader(sheet: WorkSheet) {
  const row = [2, 3, 4].find((row) =>
    cellText(sheet, row, 'B').toUpperCase() === 'TYPE'
    && /^DUE DATE\b/i.test(cellText(sheet, row, 'D'))
    && cellText(sheet, row, 'E').toUpperCase() === 'REMARKS'
  );
  if (!row) throw new Error('The worksheet is missing the original Type, Due Date and Remarks columns.');
  return row;
}

export function inspectComplianceTemplate(bytes: Buffer) {
  const { tabs } = openTemplate(bytes);
  const selected = {} as Record<CompliancePrintKind, string | null>;
  for (const kind of Object.keys(compliancePrintKinds) as CompliancePrintKind[]) {
    const tab = findTab(tabs, kind);
    if (!tab && kind !== 'agreement') throw new Error(`The workbook needs the ${compliancePrintKinds[kind].label} worksheet.`);
    if (tab) layoutHeader(worksheet(bytes, tab));
    selected[kind] = tab?.name ?? null;
  }
  return selected;
}

function titleKey(value: string) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/\((?:monthly|quarterly|quaterly|weekly|yearly|annual|annually)\)/g, '')
    .replace(/\bservices\b/g, 'service').replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function displayDate(iso: string) {
  return iso.split('-').reverse().join('/');
}

function dateValue(iso: string, date1904: boolean, numberFormat: string | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('A matched record has an invalid expiry date.');
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || !new Date(time).toISOString().startsWith(iso)) {
    throw new Error('A matched record has an invalid expiry date.');
  }
  return numberFormat && SSF.is_date(numberFormat) ? Math.round((time - Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30)) / 86400000) : displayDate(iso);
}

function matchesDate(sheet: WorkSheet, row: number, iso: string, date1904: boolean) {
  const cell = sheet['D' + row];
  if (typeof cell?.v === 'number' && cell.z && SSF.is_date(cell.z)) return cell.v === dateValue(iso, date1904, cell.z);
  return cellText(sheet, row, 'D') === displayDate(iso) || cellText(sheet, row, 'D') === iso;
}

function mergeAnchor(sheet: WorkSheet, address: string) {
  const cell = utils.decode_cell(address);
  const range = sheet['!merges']?.find(({ s, e }) => s.c <= cell.c && e.c >= cell.c && s.r <= cell.r && e.r >= cell.r);
  return range ? utils.encode_cell(range.s) : address;
}

function matchingRow(sheet: WorkSheet, kind: CompliancePrintKind, record: CompliancePrintRecord, header: number, end: number, date1904: boolean) {
  const row = record.template_row;
  if (row !== null) return Number.isInteger(row) && row > header && row <= end ? row : null;
  const key = titleKey(record.title);
  if (!key) return null;
  const matches: number[] = [];
  for (let i = header + 1; i <= end; i++) if (titleKey(cellText(sheet, i, 'B')) === key) matches.push(i);
  if (matches.length !== 1) return null;
  const titleRow = matches[0];
  if (kind !== 'servicing') return titleRow;
  // A servicing heading may cover several dates. Without a saved row binding, use only a unique exact period.
  const dates: number[] = [];
  for (let i = titleRow; i <= end; i++) {
    if (i > titleRow && cellText(sheet, i, 'B') && (cellText(sheet, i, 'A') || cellText(sheet, i, 'C'))) break;
    if (record.next_due_date && matchesDate(sheet, i, record.next_due_date, date1904)) dates.push(i);
  }
  return dates.length === 1 ? dates[0] : null;
}

function planChanges(sheet: WorkSheet, kind: CompliancePrintKind, records: CompliancePrintRecord[], date1904: boolean) {
  const header = layoutHeader(sheet);
  const end = utils.decode_range(sheet['!ref']!).e.r + 1;
  const changes = new Map<string, CellChange>();
  const unmapped: string[] = [];
  function addChange(address: string, value: CellValue, row: number) {
    const anchor = mergeAnchor(sheet, address);
    if (anchor[0] !== address[0] || utils.decode_cell(anchor).r + 1 <= header) {
      throw new Error(`The selected print cell ${address} belongs to a heading merge.`);
    }
    const prior = changes.get(anchor);
    if (prior && prior.value !== value) throw new Error(`Worksheet rows ${prior.sourceRow} and ${row} share ${anchor} but have different values. Split that cell in the print template before printing.`);
    changes.set(anchor, { value, sourceRow: row });
  }
  for (const record of records) {
    const row = matchingRow(sheet, kind, record, header, end, date1904);
    if (row === null) {
      unmapped.push(record.title);
      continue;
    }
    if (record.next_due_date) {
      const anchor = mergeAnchor(sheet, 'D' + row);
      addChange('D' + row, dateValue(record.next_due_date, date1904, sheet[anchor]?.z), row);
    }
    if (record.notes !== null) addChange('E' + row, record.notes, row);
  }
  for (const [cell, change] of changes) if ((sheet[cell]?.v ?? '') === change.value) changes.delete(cell);
  return { changes, unmapped };
}

export function inspectCompliancePrintCoverage(bytes: Buffer, records: (CompliancePrintMaster & { record_type: string })[]): CompliancePrintCoverage[] {
  const { tabs, date1904 } = openTemplate(bytes);
  return (Object.keys(compliancePrintKinds) as CompliancePrintKind[]).map((kind) => {
    const tab = findTab(tabs, kind);
    const selected = records.filter(({ record_type }) => record_type === kind);
    if (!tab) return { kind, sheetName: null, unmapped: selected.map(({ title }) => title), error: null };
    try {
      const { unmapped } = planChanges(worksheet(bytes, tab), kind, printRecords(kind, selected), date1904);
      return { kind, sheetName: tab.name, unmapped: [...new Set(unmapped)], error: null };
    } catch (error) {
      return { kind, sheetName: tab.name, unmapped: [], error: error instanceof Error ? error.message : 'Could not verify this print list.' };
    }
  });
}

function updateCell(worksheetXml: string, address: string, value: CellValue) {
  const column = utils.decode_cell(address).c;
  const row = utils.decode_cell(address).r + 1;
  const cellPattern = new RegExp(`<c\\b(?=[^>]*\\br="${address}")(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/c>)`);
  const cellXml = (original?: string) => {
    const tag = original?.match(/^<c\b[^>]*>/)?.[0] ?? `<c r="${address}">`;
    const base = tag.replace(/\s+t=(["'])[^"']*\1/, '').replace(/\/?>(?=$)/, '');
    if (typeof value === 'number') return `${base}><v>${value}</v></c>`;
    return `${base} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
  };
  if (cellPattern.test(worksheetXml)) return worksheetXml.replace(cellPattern, (cell) => cellXml(cell));
  const rowPattern = new RegExp(`(<row\\b(?=[^>]*\\br="${row}")[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  if (!rowPattern.test(worksheetXml)) throw new Error(`Worksheet row ${row} is missing from the original print layout.`);
  return worksheetXml.replace(rowPattern, (_full, start: string, content: string, end: string) => {
    const next = [...content.matchAll(/<c\s[^>]*\br="([A-Z]+\d+)"/g)].find(([, reference]) => utils.decode_cell(reference).c > column);
    const position = next?.index ?? content.length;
    return start + content.slice(0, position) + cellXml() + content.slice(position) + end;
  });
}

export function buildCompliancePrint(bytes: Buffer, kind: CompliancePrintKind, records: CompliancePrintRecord[]) {
  const { archive, workbook, tabs, date1904 } = openTemplate(bytes);
  const tab = findTab(tabs, kind);
  if (!tab) throw new Error(`The workbook needs the ${compliancePrintKinds[kind].label} worksheet.`);
  const { changes, unmapped } = planChanges(worksheet(bytes, tab), kind, records, date1904);
  // Keep the selected sheet's print settings intact and suppress print ranges on other tabs.
  // Some spreadsheet applications print an explicit print range even when its sheet is hidden.
  const workbookXml = workbook.replace(/<workbookView\b[^>]*>/g, (tag) => setAttribute(tag, 'activeTab', String(tab.index)))
    .replace(/<sheet\s[^>]*\/>/g, (tag) => {
      const { name, state } = attributes(tag);
      if (name === tab.name) return tag.replace(/\s+state=(["'])[^"']*\1/, '');
      return state === 'veryHidden' ? tag : setAttribute(tag, 'state', 'hidden');
    })
    .replace(/<definedName\s[^>]*>[\s\S]*?<\/definedName>/g, (part) => {
      const { name, localSheetId } = attributes(part.slice(0, part.indexOf('>') + 1));
      const isPrintSetting = name === '_xlnm.Print_Area' || name === '_xlnm.Print_Titles';
      return isPrintSetting && localSheetId !== undefined && Number(localSheetId) !== tab.index ? '' : part;
    });
  replacePart(archive, 'xl/workbook.xml', workbookXml);
  for (const sheet of tabs) {
    const originalXml = readPart(archive, sheet.path);
    let xml = originalXml.replace(/<sheetView\s[^>]*>/g, (tag) => sheet === tab
      ? setAttribute(tag, 'tabSelected', '1')
      : tag.replace(/\s+tabSelected=(["'])[^"']*\1/, ''));
    if (sheet === tab) for (const [cell, change] of changes) xml = updateCell(xml, cell, change.value);
    if (xml !== originalXml) replacePart(archive, sheet.path, xml);
  }
  return { bytes: Buffer.from(CFB.write(archive, { type: 'buffer', fileType: 'zip', compression: true })), unmapped, sheetName: tab.name };
}
