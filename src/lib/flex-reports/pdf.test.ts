// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { FlexGroup, FlexInspectionSnapshot, FlexReportType } from '../flex-inspection';
import { flexStatusCell } from './layout';
import { renderFlexInspectionPdf } from './pdf';

const inspection: FlexInspectionSnapshot = {
  period: '2026-09', revision: 1, inspectionDate: '2026-09-06', inspectedByName: 'Test Inspector',
  completedAt: '2026-09-06T08:00:00Z', exceptions: { 'fixture-2': 'Example fault' },
};

function group(report: FlexReportType, sourceCell: string): FlexGroup {
  return {
    id: 'fixture', report, block: 'C', level: 2, location: 'Fixture', quantity: 2, sourceCell,
    units: [{ id: 'fixture-1', label: '1' }, { id: 'fixture-2', label: '2' }],
  };
}

function fixtureTemplate(landscape: boolean) {
  const [width, height] = landscape ? [198, 140] : [140, 198];
  return sharp({ create: { width, height, channels: 3, background: '#fff' } }).png().toBuffer();
}

describe('Flex PDF reports', () => {
  it.each([
    ['fire-extinguisher', 'F6', false],
    ['exit-sign', 'E6', true],
    ['emergency-light', "'EMERGENCY LIGHT'!G12", true],
  ] as const)('renders %s to its original A4 orientation', async (report, cell, landscape) => {
    const template = await fixtureTemplate(landscape);
    const bytes = await renderFlexInspectionPdf(report, inspection, { groups: [group(report, cell)], template });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toMatch(/SEPTEMBER 2026$/);
    expect(pdf.getPage(0).getSize()).toEqual(landscape
      ? { width: 842.4, height: 595.44 }
      : { width: 595.44, height: 842.4 });
  });

  it('maps a Block D worksheet row after the second header', () => {
    expect(flexStatusCell(group('emergency-light', 'B30'))).toEqual([325, 883, 422, 908]);
    expect(flexStatusCell(group('exit-sign', 'B26'))).toEqual([345, 777, 437, 801]);
    expect(flexStatusCell(group('fire-extinguisher', 'B30'))).toEqual([312, 961, 399, 991]);
  });

  it('fails visibly if a source cell cannot map to the scanned table', () => {
    expect(() => flexStatusCell(group('emergency-light', 'G17'))).toThrow(/No Flex PDF status cell/);
  });
});
