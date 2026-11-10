import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PageSizes, rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import type { BillingLine } from './billing-preview';

const TABLE_WIDTH = 412;
const IMAGE_CELL = 160;
const READING_CELL = 46;
const HALF_WIDTH = IMAGE_CELL + READING_CELL;
const IMAGE_SIZE = 150;
const TABLE_HEIGHT = 192;
const METERS_PER_PAGE = 2;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FONT_DIR = join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts');

function meterDate(value: string | undefined) {
  if (!value) return 'Date unavailable';
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) return 'Date unavailable';
  return `${date.getUTCDate()}-${SHORT_MONTHS[date.getUTCMonth()]}-${value.slice(2, 4)}`;
}

function drawCentered(page: PDFPage, value: string, center: number, top: number, font: PDFFont,
  size: number, maxWidth = TABLE_WIDTH - 8) {
  const supported = new Set(font.getCharacterSet());
  const text = Array.from(value.trim().replace(/\s+/g, ' '), character =>
    supported.has(character.codePointAt(0)!) ? character : '?').join('');
  const width = font.widthOfTextAtSize(text, size);
  const scale = width > maxWidth ? maxWidth / width : 1;
  page.drawText(text, { x: center - width * scale / 2, y: page.getHeight() - top, font, size: size * scale });
}

async function embedMeterPhoto(pdf: PDFDocument, value: string) {
  if (value.startsWith('data:image/jpeg;base64,')) return pdf.embedJpg(value);
  if (value.startsWith('data:image/png;base64,')) return pdf.embedPng(value);
  if (value.startsWith('data:image/webp;base64,')) {
    const { default: sharp } = await import('sharp');
    const original = Buffer.from(value.slice('data:image/webp;base64,'.length), 'base64');
    return pdf.embedPng(await sharp(original, { limitInputPixels: 16_000_000 }).png().toBuffer());
  }
  throw Error('Unsupported meter photo format');
}

export async function appendCustomerMeterPages(pdf: PDFDocument, utility: BillingLine, heading?: string): Promise<void> {
  const meters = [...(utility.details ?? [])].sort((first, second) =>
    Number(second.unit === 'kWh') - Number(first.unit === 'kWh'));
  if (meters.length === 0) return;

  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(join(FONT_DIR, 'LiberationSans-Regular.ttf')),
    readFile(join(FONT_DIR, 'LiberationSans-Bold.ttf')),
  ]);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const title = utility.accountId === 'emma-omar' ? 'CAFETERIA (ZIELA FOODILICIOUS)' : heading?.trim() || utility.name;

  for (let index = 0; index < meters.length; index += METERS_PER_PAGE) {
    const page = pdf.addPage(PageSizes.A4);
    const center = page.getWidth() / 2;
    const left = center - TABLE_WIDTH / 2;
    const right = left + TABLE_WIDTH;
    const drawLine = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1, y: page.getHeight() - y1 }, end: { x: x2, y: page.getHeight() - y2 }, thickness: 0.6 });

    drawCentered(page, title, center, 59, bold, 8);
    drawCentered(page, 'UTILITIES READING', center, 72, regular, 8);

    for (const [slot, meter] of meters.slice(index, index + METERS_PER_PAGE).entries()) {
      const top = 81 + slot * 200;
      const imageTop = top + 16;
      const dateTop = imageTop + IMAGE_CELL;
      page.drawRectangle({
        x: left, y: page.getHeight() - top - TABLE_HEIGHT, width: TABLE_WIDTH, height: TABLE_HEIGHT,
        borderWidth: 0.8, borderColor: rgb(0, 0, 0),
      });
      drawLine(left, imageTop, right, imageTop);
      drawLine(left, dateTop, right, dateTop);
      drawLine(center, imageTop, center, top + TABLE_HEIGHT);
      for (const x of [left + IMAGE_CELL, center + IMAGE_CELL]) drawLine(x, imageTop, x, dateTop);

      const label = meter.label?.trim() || (meter.unit === 'm³' ? 'WATER (m³)' : 'ELECTRICITY (kWh)');
      drawCentered(page, label, center, top + 10.5, bold, 8);

      for (const [side, reading] of [
        { photo: meter.previousPhoto, value: meter.prev, date: meter.previousDate },
        { photo: meter.photo, value: meter.curr, date: meter.currentDate },
      ].entries()) {
        const start = left + side * HALF_WIDTH;
        const imageCenter = start + IMAGE_CELL / 2;
        if (reading.photo) {
          const image = await embedMeterPhoto(pdf, reading.photo);
          const { width, height } = image.scaleToFit(IMAGE_SIZE, IMAGE_SIZE);
          page.drawImage(image, { x: imageCenter - width / 2, y: page.getHeight() - imageTop - (IMAGE_CELL + height) / 2,
            width, height });
        } else {
          drawCentered(page, 'No photo on file', imageCenter, imageTop + 83, regular, 8);
        }
        const value = Number.isFinite(reading.value) ? String(reading.value) : '—';
        drawCentered(page, value, start + IMAGE_CELL + READING_CELL / 2,
          imageTop + 83, regular, 9, READING_CELL - 6);
        drawCentered(page, meterDate(reading.date), start + HALF_WIDTH / 2, dateTop + 10.5, bold, 8);
      }
    }
  }
}
