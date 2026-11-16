import {
  concatTransformationMatrix, PDFDocument, type PDFFont, type PDFImage,
  popGraphicsState, pushGraphicsState, rgb, StandardFonts,
} from 'pdf-lib';
import type { FlexGroup, FlexInspectionSnapshot, FlexReportType } from '../flex-inspection';
import { flexStatusCell, type Rect, REPORT_LAYOUTS } from './layout';

export interface FlexInspectionPdfOptions {
  groups: FlexGroup[];
  template: Uint8Array;
  signature?: Uint8Array;
  stamp?: Uint8Array;
}

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
  'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const INK = rgb(0.13, 0.18, 0.17);
const FAULT = rgb(0.65, 0.072, 0.21);
const PEN = rgb(0.11, 0.22, 0.49);

function monthLabel(period: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(period);
  if (!match) throw new Error('Invalid Flex inspection period');
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

function dateLabel(date: string | null) {
  const match = date && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function plainText(value: string, font: PDFFont) {
  const glyphs = new Set(font.getCharacterSet());
  return Array.from(value.trim().replace(/\s+/g, ' '), (character) => {
    if (glyphs.has(character.codePointAt(0)!)) return character;
    const simplified = character.normalize('NFD').replace(/\p{Mark}/gu, '');
    return simplified && Array.from(simplified).every((letter) => glyphs.has(letter.codePointAt(0)!))
      ? simplified
      : '?';
  }).join('');
}

function embedSignatureAsset(pdf: PDFDocument, bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return pdf.embedJpg(bytes);
  return pdf.embedPng(bytes);
}

export async function renderFlexInspectionPdf(
  report: FlexReportType,
  inspection: FlexInspectionSnapshot,
  options: FlexInspectionPdfOptions,
): Promise<Uint8Array> {
  const layout = REPORT_LAYOUTS[report];
  const month = monthLabel(inspection.period);
  const groups = options.groups.filter((group) => group.report === report);
  if (!groups.length) throw new Error(`Missing Flex inventory for ${report}`);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${layout.title} - ${month}`);
  const page = pdf.addPage(layout.pageSize);
  const [width, height] = layout.pageSize;
  const sx = width / layout.referenceSize[0];
  const sy = height / layout.referenceSize[1];
  const x = (value: number) => value * sx;
  const y = (value: number) => height - value * sy;
  const template = await pdf.embedPng(options.template);
  if (Math.abs(template.width / template.height - width / height) > 0.005) {
    throw new Error(`Invalid Flex template aspect ratio for ${report}`);
  }
  page.drawImage(template, { x: 0, y: 0, width, height });

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  function text(
    value: string,
    box: Rect,
    size: number,
    color: ReturnType<typeof rgb>,
    settings?: { bold?: boolean; center?: boolean; fitWidth?: boolean },
  ) {
    const face = settings?.bold ? bold : font;
    const [left, , right, bottom] = box;
    const fontSize = size * sy;
    const lineWidth = x(right - left);
    const desiredWidth = face.widthOfTextAtSize(value, fontSize);
    const scale = Math.min(1, lineWidth / desiredWidth);
    if (settings?.fitWidth && scale < 1) {
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(scale, 0, 0, 1, x(left), y(bottom)));
      page.drawText(value, { x: 0, y: 0, size: fontSize, font: face, color });
      page.pushOperators(popGraphicsState());
    } else {
      const offset = settings?.center ? (lineWidth - desiredWidth * scale) / 2 : 0;
      page.drawText(value, { x: x(left) + offset, y: y(bottom), size: fontSize * scale, font: face, color });
    }
  }

  function check(cx: number, cy: number) {
    const point = (px: number, py: number) => ({ x: x(px), y: y(py) });
    const elbow = point(cx - 1.6, cy + 3);
    page.drawLine({ start: point(cx - 4.5, cy), end: elbow, thickness: 0.73, color: INK });
    page.drawLine({ start: elbow, end: point(cx + 5, cy - 5), thickness: 0.73, color: INK });
  }

  function fitImage(image: PDFImage, rect: Rect, centered: boolean) {
    const [left, top, right, bottom] = rect;
    const maxWidth = x(right - left);
    const maxHeight = (bottom - top) * sy;
    const imageSize = image.scaleToFit(maxWidth, maxHeight);
    const offset = centered ? (maxWidth - imageSize.width) / 2 : 0;
    page.drawImage(image, { x: x(left) + offset, y: y(bottom), ...imageSize });
  }

  const [monthLeft, monthTop, monthRight, monthBottom] = layout.month;
  text(month, [monthLeft + 4, monthTop, monthRight, monthBottom - 2], 22, INK, { bold: true, fitWidth: true });
  const date = dateLabel(inspection.inspectionDate);
  if (date) text(date, layout.date, 16, PEN);

  if (options.signature) {
    fitImage(await embedSignatureAsset(pdf, options.signature), layout.signature, false);
  } else if (inspection.inspectedByName?.trim()) {
    text(plainText(inspection.inspectedByName, font), layout.inspector, 15, PEN);
  }
  if (options.stamp) fitImage(await embedSignatureAsset(pdf, options.stamp), layout.stamp, true);

  const statusCells = new Set<string>();
  for (const group of groups) {
    const [left, top, right, bottom] = flexStatusCell(group);
    const cell = `${left},${top}`;
    if (statusCells.has(cell)) throw new Error(`Duplicate Flex status cell ${group.sourceCell}`);
    statusCells.add(cell);
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const faultCount = group.units.filter(({ id }) => Object.hasOwn(inspection.exceptions, id)).length;
    const passCount = group.units.length - faultCount;
    if (faultCount === 0) {
      check(centerX, centerY - 1);
    } else if (passCount === 0) {
      const status = report === 'emergency-light' && faultCount === 1 ? 'X-FAULTY' : 'X';
      text(status, [left + 6, top, right - 6, centerY + 5], 14, FAULT, { center: true });
    } else if (bottom - top >= 34) {
      const passLabel = `${passCount} ${passCount === 1 ? 'UNIT' : 'UNITS'} -`;
      text(passLabel, [left + 8, top, centerX + 26, centerY - 4], 14, INK, { center: true });
      check(centerX + 34, centerY - 11);
      const faultLabel = `${faultCount} ${faultCount === 1 ? 'UNIT' : 'UNITS'} - X`;
      text(faultLabel, [left + 5, centerY, right - 5, bottom - 4], 14, FAULT, { center: true });
    } else {
      text(String(passCount), [left + 5, top, centerX - 16, centerY + 5], 13, INK, { center: true });
      check(centerX - 13, centerY - 1);
      text(`/ ${faultCount} X`, [centerX - 3, top, right - 5, centerY + 5], 13, FAULT, { center: true });
    }
  }

  return pdf.save();
}
