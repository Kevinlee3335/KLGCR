import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { planWorkbookImport, readDueDate } from './compliance-workbook-plan.mjs';

const header = ['NO', 'TYPE', 'LOCAL AUTH / COMPANY', 'DUE DATE', 'REMARKS', 'CONTACT', 'HP NO.', 'EMAIL'];
const serial = (year, month, day) => (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;

function addSheet(book, name, rows, merges = []) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = merges.map((range) => XLSX.utils.decode_range(range));
  XLSX.utils.book_append_sheet(book, sheet, name);
  return sheet;
}

function sampleWorkbook(duplicateCert = false) {
  const book = XLSX.utils.book_new();
  const cert = (day) => [[], [], header,
    [1, 'Business Permit', 'Council', serial(2030, 12, 31)],
    [2, 'Fire Extinguishers:', 'Example Fire Co'],
    [null, 'a) Block P', null, day], [null, 'b) Block Q'],
    ...(duplicateCert ? [[3, 'Business Permit', 'Council', serial(2030, 12, 31)]] : []),
    ['Rental agreement'], [4, 'Printer Model P1234', 'Copy Centre', serial(2031, 1, 16)],
  ];
  addSheet(book, 'CERT & LICENSE (03102030)', cert(serial(2030, 10, 26)), ['C5:C7', 'D6:D7']);
  addSheet(book, 'CERT & LICENSE (22112030)', cert(serial(2031, 11, 18)), ['C5:C7', 'D6:D7']);
  const service = addSheet(book, 'SERVICING (22112030)', [[], [], header, [],
    [1, 'Lift Inspection (Monthly)', 'Example Fire Co / Lift Company', serial(2030, 11, 1), 'Done on 3/11/2030'],
    [null, null, null, serial(2030, 11, 1), 'Done on 6/11/2030'],
    [null, null, null, serial(2030, 12, 1), 'TBC'],
    [null, null, null, 'November 2029', 'No day recorded'],
    [2, 'Water Testing', 'Lab Company', 'April 18,2031', 'Result received by email on 22/03/30 - Passed'],
  ], ['B3:B4', 'B5:B7', 'C5:C7']);
  service['!rows'] = Array.from({ length: 8 }, (_, row) => ({ hidden: row === 4 }));
  addSheet(book, 'AGREEMENT RENEWAL', [[], header, [1, 'Lift Company', 'Lift contract', 'February 2031'],
    [2, 'Copy Centre Sdn Bhd', 'Printer S1234', serial(2030, 1, 16)]]);
  return book;
}

test('uses civil Excel dates and flags dates with missing or invalid days', () => {
  assert.equal(readDueDate(serial(2030, 12, 31)), '2030-12-31');
  assert.equal(readDueDate('April 18,2031'), '2031-04-18');
  assert.equal(readDueDate('26/10/30'), '2030-10-26');
  assert.equal(readDueDate('February 2031'), null);
  assert.equal(readDueDate('31/02/2031'), null);
});

test('preserves current and previous Cert expiry cells without recording completion', () => {
  const plan = planWorkbookImport(sampleWorkbook(), []);
  const blockP = plan.records.find((record) => record.location === 'Block P');
  const blockQ = plan.records.find((record) => record.location === 'Block Q');
  assert.equal(plan.requires_admin_review, true);
  assert.equal(blockP.proposed_current_due, '2031-11-18');
  assert.deepEqual(blockP.previous_expiries.map((cycle) => cycle.due_date), ['2030-10-26']);
  assert.equal(blockP.cycles[0].date_cell, 'D6');
  assert.equal(blockQ.cycles[0].date_cell, 'D6');
  assert.deepEqual(blockP.required_evidence, ['certificate', 'invoice']);
  assert.ok(blockP.flags.includes('earlier_expiry_dates_are_not_proof_of_completion'));
  assert.equal('completed_at' in blockP.cycles[0], false);
});

test('dedupes service schedules with source rows intact and flags ambiguous supplier or date', () => {
  const plan = planWorkbookImport(sampleWorkbook(), [], [
    { id: 'fire', name: 'Example Fire Co' }, { id: 'lift', name: 'Lift Company' },
  ]);
  const service = plan.records.find((record) => record.record_type === 'servicing');
  const agreement = plan.records.find((record) => record.record_type === 'agreement');
  assert.equal(service.cycles.length, 2);
  assert.deepEqual(service.cycles[0].alternate_source_rows, [5]);
  assert.deepEqual(service.cycles[0].reported_performed_dates, ['2030-11-03', '2030-11-06']);
  assert.equal(service.proposed_current_due, '2030-12-01');
  assert.equal(service.supplier_key_candidate, null);
  assert.ok(service.flags.includes('multiple_possible_supplier_archives'));
  assert.equal(plan.unbound_servicing_rows[0].due_text, 'November 2029');
  assert.equal(agreement.proposed_current_due, null);
  assert.equal(agreement.supplier_key_candidate, 'lift');
  const waterTest = plan.records.find((record) => record.title === 'Water Testing');
  assert.equal(waterTest.proposed_current_due, '2031-04-18');
  assert.deepEqual(waterTest.cycles[0].reported_performed_dates, []);
});

test('does not allocate one production ID to two workbook rows or overwrite its due date', () => {
  const original = { id: 'existing-permit', record_type: 'certificate_license', title: 'Business Permit', provider: 'Council', next_due_date: '2030-11-30' };
  const [first] = planWorkbookImport(sampleWorkbook(), [original]).records;
  assert.equal(first.existing_record_id, original.id);
  assert.ok(first.flags.includes('existing_due_differs'));
  assert.equal(original.next_due_date, '2030-11-30');
  const collision = planWorkbookImport(sampleWorkbook(true), [original]);
  assert.ok(collision.records.filter((record) => record.title === original.title).every((record) => (
    !record.existing_record_id && record.flags.includes('same_existing_record_claimed_by_multiple_rows')
  )));
  assert.equal(collision.existing_without_exact_match[0].id, original.id);
});

test('flags the same provider and equipment model in the certificate contract section and Agreement tab', () => {
  const { records } = planWorkbookImport(sampleWorkbook(), []);
  const possibleDuplicates = records.filter((record) => record.flags.includes('possible_contract_in_both_sheets'));
  assert.equal(possibleDuplicates.length, 2);
  assert.equal(possibleDuplicates[0].cross_sheet_contracts[0].due_date, '2030-01-16');
  assert.equal(possibleDuplicates[1].cross_sheet_contracts[0].due_date, '2031-01-16');
});
