// @vitest-environment node
import { CFB, read, utils, write } from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildCompliancePrint, inspectCompliancePrintCoverage, inspectComplianceTemplate, printRecords, type CompliancePrintRecord } from './compliance-print';

const date = (value: string) => (Date.parse(value) - Date.UTC(1899, 11, 30)) / 86400000;
const rows = [
  ['COMPLIANCE'],
  [],
  ['NO', 'TYPE', 'LOCAL AUTH / COMPANY', 'DUE DATE', 'REMARKS', 'CONTACT'],
  [1, 'Business License', 'Local authority', date('2026-10-01'), 'Previous note', 'Office'],
  [2, 'First asset', 'Supplier', date('2026-10-01'), ''],
  [3, 'Second asset', 'Supplier', '', ''],
];
const nativePageSetup = '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><rowBreaks count="1" manualBreakCount="1"><brk id="5" min="0" max="16383" man="1"/></rowBreaks>';

function part(archive: ReturnType<typeof CFB.read>, path: string) {
  return CFB.find(archive, 'Root Entry/' + path)!;
}

function xml(bytes: Buffer, path: string) {
  return Buffer.from(part(CFB.read(bytes, { type: 'buffer' }), path).content).toString('utf8');
}

function replace(archive: ReturnType<typeof CFB.read>, path: string, transform: (value: string) => string) {
  const file = part(archive, path);
  file.content = Buffer.from(transform(Buffer.from(file.content).toString('utf8')));
  file.size = file.content.byteLength;
}

function fixture() {
  const workbook = utils.book_new();
  const latest = utils.aoa_to_sheet(rows);
  latest.D4.z = 'dd/mm/yyyy';
  latest.D5.z = 'dd/mm/yyyy';
  latest['!merges'] = [utils.decode_range('D5:D6')];
  latest['!cols'] = [{ wch: 6 }, { wch: 45 }];
  latest['!rows'] = [...Array(5).fill({}), { hidden: true }];
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), 'CERT & LICENSE (01102026)');
  utils.book_append_sheet(workbook, latest, 'CERT & LICENSE (12112026)');
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), 'SERVICING (12112026)');
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), 'AGREEMENT RENEWAL');
  workbook.Workbook = { Names: [
    { Name: '_xlnm.Print_Area', Sheet: 1, Ref: "'CERT & LICENSE (12112026)'!$A$1:$F$6" },
    { Name: '_xlnm.Print_Area', Sheet: 2, Ref: "'SERVICING (12112026)'!$A$1:$F$5" },
  ] };
  const bytes = Buffer.from(write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }));
  const archive = CFB.read(bytes, { type: 'buffer' });
  replace(archive, 'xl/worksheets/sheet2.xml', (value) => value.replace('</worksheet>', nativePageSetup + '</worksheet>'));
  return Buffer.from(CFB.write(archive, { type: 'buffer', fileType: 'zip' }));
}

const live: CompliancePrintRecord = {
  title: 'Business License', next_due_date: '2027-10-02', notes: 'Report & invoice <received>', template_row: 4,
};

describe('compliance Excel print', () => {
  it('opens the newest selected tab and preserves the source print layout, styles and other worksheet data', () => {
    const source = fixture();
    expect(inspectComplianceTemplate(source)).toEqual({
      certificate_license: 'CERT & LICENSE (12112026)', servicing: 'SERVICING (12112026)', agreement: 'AGREEMENT RENEWAL',
    });
    const result = buildCompliancePrint(source, 'certificate_license', [live]);
    expect(result.unmapped).toEqual([]);
    const workbook = read(result.bytes, { type: 'buffer', cellNF: true, cellStyles: true });
    const sheet = workbook.Sheets[result.sheetName];
    expect(sheet.D4).toMatchObject({ v: date('2027-10-02'), z: 'dd/mm/yyyy' });
    expect(sheet.E4.v).toBe(live.notes);
    expect(workbook.Workbook?.Sheets?.map((item) => item.Hidden ?? 0)).toEqual([1, 0, 1, 1]);
    const sheetXml = xml(result.bytes, 'xl/worksheets/sheet2.xml');
    expect(sheetXml).toContain(nativePageSetup);
    expect(sheetXml).toContain('<mergeCell ref="D5:D6"/>');
    expect(sheetXml).toMatch(/<row[^>]*r="6"[^>]*hidden="1"/);
    expect(sheetXml).toContain('tabSelected="1"');
    expect(xml(result.bytes, 'xl/workbook.xml')).toContain('$A$1:$F$6');
    expect(xml(result.bytes, 'xl/workbook.xml')).not.toContain('$A$1:$F$5');
    expect(xml(result.bytes, 'xl/styles.xml')).toBe(xml(source, 'xl/styles.xml'));
    expect(xml(result.bytes, 'xl/worksheets/sheet1.xml')).toBe(xml(source, 'xl/worksheets/sheet1.xml'));
  });

  it('reports unmatched records and prevents different dates from overwriting the same merged cell', () => {
    const source = fixture();
    expect(buildCompliancePrint(source, 'certificate_license', [{ ...live, title: 'Needs a print row', template_row: null }]).unmapped)
      .toEqual(['Needs a print row']);
    expect(inspectCompliancePrintCoverage(source, [{ ...live, record_type: 'certificate_license', title: 'Needs a print row', template_row: null }])[0].unmapped)
      .toEqual(['Needs a print row']);
    expect(() => buildCompliancePrint(source, 'certificate_license', [
      { ...live, template_row: 5, notes: null },
      { ...live, template_row: 6, notes: null, next_due_date: '2027-10-03' },
    ])).toThrow('share D5');
  });

  it('retains original servicing period rows and uses the separately linked current cycle', () => {
    expect(printRecords('servicing', [{
      ...live,
      compliance_cycles: [
        { template_row: 4, due_date: '2026-10-01', notes: 'Prior period', status: 'completed', completed_at: '2026-10-03T00:00:00Z' },
        { template_row: 6, due_date: '2027-10-02', notes: 'Current period', status: 'open', completed_at: null },
      ],
    }])).toEqual([
      { title: live.title, template_row: 4, next_due_date: '2026-10-01', notes: 'Prior period' },
      { title: live.title, template_row: 6, next_due_date: '2027-10-02', notes: 'Current period' },
    ]);
  });
});
