import fontkit from '@pdf-lib/fontkit';
// fontkit's Indic shaper uses this runtime when laying out Tamil graphemes.
import 'regenerator-runtime/runtime';
import {
  PDFDocument, PDFHexString, PDFName, PDFOperator, PDFOperatorNames,
  rgb, clip, endMarkedContent, endPath, popGraphicsState, pushGraphicsState, rectangle,
  type PDFFont, type PDFPage,
} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {brotliDecompressSync} from 'node:zlib';
import {amountWords, financePaperSizes} from './official-receipt';
import {companySealDataUrl} from './company-seal';
import {signaturePhotoBounds} from './signature-image-layout';
import {signatureSchema, type Signature} from './purchase-orders/signature';

export type DepositReceiptPdfData = {
  receipt_no: string;
  payer: string;
  email?: string;
  member_reference: string;
  amount: number;
  received_on: string;
  received_by_name: string;
  issuer_signature?: Signature | null;
  origin?: 'received' | 'existing';
  original_receipt_no?: string | null;
  note?: string | null;
};

export type PaymentVoucherPdfData = {
  voucher_no: string;
  payer: string;
  email?: string;
  member_reference: string;
  amount: number;
  paid_on: string;
  refunded_by_name: string;
  refund_signature: Signature;
  original_receipt_no?: string | null;
  origin?: 'deposit_refund' | 'legacy_refund';
};

const MARGIN = 28;
const INK = rgb(.14, .19, .26);
const MUTED = rgb(.39, .44, .49);
const GOLD = rgb(.71, .58, .37);
const RULE = rgb(.84, .86, .88);
const PALE = rgb(.95, .96, .965);
const NOTE = rgb(.975, .961, .932);
const recipientNote = "The recipient's signature is not required for this payment voucher.";
const graphemes = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
type TextMetrics = Pick<PDFFont, 'widthOfTextAtSize'>;

function textUnits(value: string): string[] {
  const units: string[] = [];
  for (const {segment} of graphemes.segment(value)) {
    const previous = units.at(-1);
    // Intl may split Tamil conjuncts such as ஸ்ரீ and க்ஷ across graphemes.
    // Keep a virama and its following consonant together for font shaping.
    if (previous && /\u0bcd[\u200c\u200d]*$/u.test(previous) && /^[\u0b95-\u0bb9]/u.test(segment)) units[units.length - 1] += segment;
    else units.push(segment);
  }
  return units;
}

type DocumentInput = {
  kind: 'receipt' | 'voucher';
  number: string;
  date: string;
  payer: string;
  reference: string;
  amount: number;
  actor: string;
  signature?: Signature | null;
  existing?: boolean;
  originalReceipt?: string | null;
  legacyRefund?: boolean;
};

function clean(value: string) {
  return value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

function printedDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid document date.');
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid document date.');
  return new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur'}).format(date);
}

/** Keep every character, including long unbroken names, inside the assigned width. */
function wrapped(value: string, font: TextMetrics, size: number, width: number | ((line: number) => number)): string[] {
  const lines: string[] = [];
  const availableWidth = () => typeof width === 'number' ? width : width(lines.length);
  let line = '';
  for (const word of clean(value).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= availableWidth()) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of textUnits(word)) {
      if (line && font.widthOfTextAtSize(line + character, size) > availableWidth()) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

async function drawSignature(
  pdf: PDFDocument, page: PDFPage, signature: Signature | null | undefined,
  box: {x: number; y: number; width: number; height: number},
) {
  if (!signature) return;
  const parsed = signatureSchema.safeParse(signature);
  if (!parsed.success) throw new Error('The staff signature is invalid. Please update the saved signature.');
  const value = parsed.data;
  if (value.imageDataUrl) {
    const image = await pdf.embedPng(value.imageDataUrl);
    const bounds = signaturePhotoBounds(value.imageDataUrl);
    const scale = Math.min(box.width / bounds.width, box.height / bounds.height);
    const imageBottom = bounds.imageHeight - bounds.top - bounds.height;
    page.pushOperators(pushGraphicsState(), rectangle(box.x, box.y, box.width, box.height), clip(), endPath());
    page.drawImage(image, {
      x: box.x + box.width / 2 - (bounds.left + bounds.width / 2) * scale,
      y: box.y + (box.height - bounds.height * scale) / 2 - imageBottom * scale,
      width: bounds.imageWidth * scale, height: bounds.imageHeight * scale,
    });
    page.pushOperators(popGraphicsState());
  } else {
    for (const stroke of value.strokes) {
      for (let i = 1; i < stroke.length; i++) {
        const point = ([x, y]: number[]) => ({x: box.x + x * box.width, y: box.y + (1 - y) * box.height});
        page.drawLine({start: point(stroke[i - 1]), end: point(stroke[i]), thickness: 1.05, color: INK});
      }
    }
  }
}

async function render(input: DocumentInput): Promise<Buffer> {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 999999999) throw new Error('Invalid document amount.');
  if (!clean(input.number) || !clean(input.payer) || !clean(input.actor)) throw new Error('Document number, recipient and staff name are required.');
  if (input.kind === 'voucher' && !signatureSchema.safeParse(input.signature).success) throw new Error('A refunding staff signature is required.');
  const date = printedDate(input.date);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit({create(bytes: Uint8Array) {
    const face = fontkit.create(bytes) as ReturnType<typeof fontkit.create> & {'CFF '?: {length: number; offSize: number}};
    const cff = face['CFF '];
    // fontkit 1.1.1 writes cff.length into the CFF subset's header offSize.
    // Its length is a dictionary length, often >4, which makes the embedded
    // font invalid in PDF viewers. Preserve the source font's valid offSize.
    if (bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f
      && cff && cff.length > 4 && cff.offSize >= 1 && cff.offSize <= 4) {
      cff.length = cff.offSize;
    }
    return face;
  }});
  const [regularBytes, boldBytes, letterheadBytes] = await Promise.all([
    readFile(join(process.cwd(), 'src/lib/finance-fonts/regular.ttf')),
    readFile(join(process.cwd(), 'src/lib/finance-fonts/bold.ttf')),
    readFile(join(process.cwd(), 'public/billing/receipt-letterhead.png')),
  ]);
  const regular = await pdf.embedFont(regularBytes, {subset: true});
  const bold = await pdf.embedFont(boldBytes, {subset: true});
  const regularCharacters = new Set(regular.getCharacterSet());
  const boldCharacters = new Set(bold.getCharacterSet());
  const values = [input.number, input.payer, input.reference, input.actor, input.originalReceipt || ''];
  const missing = values.flatMap(value => [...clean(value)].filter(character => !regularCharacters.has(character.codePointAt(0)!)));
  const fallbacks: {font: PDFFont; characters: Set<number>}[] = [];
  // The complete licensed font faces are bundled offline. Only load/embed a
  // fallback when required; pdf-lib then subsets it to this document's glyphs.
  if (missing.some(character => /\p{Script=Tamil}/u.test(character))) {
    const tamil = await pdf.embedFont(await readFile(join(process.cwd(), 'src/lib/finance-fonts/NotoSerifTamil-Regular.ttf')), {subset: true});
    fallbacks.push({font: tamil, characters: new Set(tamil.getCharacterSet())});
  }
  if (missing.some(character => !/\p{Script=Tamil}/u.test(character))) {
    const cjkBytes = brotliDecompressSync(await readFile(join(process.cwd(), 'src/lib/finance-fonts/NotoSansCJKsc-Regular.otf.br')));
    const cjk = await pdf.embedFont(cjkBytes, {subset: true});
    fallbacks.push({font: cjk, characters: new Set(cjk.getCharacterSet())});
  }
  const fontCache = new Map<string, PDFFont>();
  const runs = (value: string, strong: boolean) => {
    const result: {text: string; font: PDFFont}[] = [];
    for (const segment of textUnits(clean(value))) {
      const key = `${strong ? 'b' : 'r'}:${segment}`;
      let face = fontCache.get(key);
      if (!face) {
        const characters = [...segment].map(character => character.codePointAt(0)!);
        const hasEveryGlyph = (available: Set<number>) => characters.every(codepoint => available.has(codepoint) || /\p{Default_Ignorable_Code_Point}/u.test(String.fromCodePoint(codepoint)));
        face = hasEveryGlyph(strong ? boldCharacters : regularCharacters) ? (strong ? bold : regular)
          : fallbacks.find(fallback => hasEveryGlyph(fallback.characters))?.font;
        if (!face) throw new Error('This document contains characters unsupported by the configured PDF fonts.');
        fontCache.set(key, face);
      }
      const previous = result.at(-1);
      if (previous?.font === face) previous.text += segment;
      else result.push({text: segment, font: face});
    }
    return result;
  };
  const textWidth = (value: string, size: number, strong = false) => runs(value, strong).reduce((width, run) => width + run.font.widthOfTextAtSize(run.text, size), 0);
  const regularLayout: TextMetrics = {widthOfTextAtSize: (value, size) => textWidth(value, size)};
  const boldLayout: TextMetrics = {widthOfTextAtSize: (value, size) => textWidth(value, size, true)};
  // Fail visibly for any remaining unsupported script instead of silently
  // changing the member's identity to dashes or missing glyphs.
  values.forEach(value => runs(value, false));
  const page = pdf.addPage(financePaperSizes.a5Landscape);
  const W = page.getWidth(), H = page.getHeight(), right = W - MARGIN;
  const title = input.kind === 'voucher' ? 'PAYMENT VOUCHER' : input.existing ? 'EXISTING DEPOSIT RECORD' : 'DEPOSIT RECEIPT';
  pdf.setTitle(`${title} ${input.number}`);
  pdf.setAuthor('KLG Campus Residence Management');
  pdf.setSubject(input.kind === 'voucher' ? 'Cash gym deposit refund signed by the refunding staff member' : input.existing ? 'Record of an existing refundable deposit; not a new cash collection' : 'Refundable gym cash deposit receipt');

  const text = (value: string, x: number, top: number, size = 9, strong = false, color = INK, align: 'left' | 'right' | 'center' = 'left') => {
    const content = clean(value);
    const width = textWidth(content, size, strong);
    let nextX = x - (align === 'right' ? width : align === 'center' ? width / 2 : 0);
    for (const run of runs(content, strong)) {
      const tamil = /\p{Script=Tamil}/u.test(run.text);
      for (const unit of tamil ? textUnits(run.text) : [run.text]) {
        // Pre-base Tamil vowels reorder in the glyph stream. Standard PDF
        // ActualText preserves logical Unicode for accessibility and copying.
        // Mark syllables individually to support viewers with partial support.
        if (tamil) page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
          PDFName.of('Span'), `<< /ActualText ${PDFHexString.fromText(unit).toString()} >>`,
        ]));
        page.drawText(unit, {x: nextX, y: H - top, size, font: run.font, color});
        if (tamil) page.pushOperators(endMarkedContent());
        nextX += run.font.widthOfTextAtSize(unit, size);
      }
    }
  };
  const rule = (top: number, x = MARGIN, end = right, color = RULE, thickness = .55) => {
    page.drawLine({start: {x, y: H - top}, end: {x: end, y: H - top}, thickness, color});
  };
  const logo = await pdf.embedPng(letterheadBytes);
  const headerWidth = W - MARGIN * 2;
  page.drawImage(logo, {x: MARGIN, y: H - 15 - headerWidth * logo.height / logo.width, width: headerWidth, height: headerWidth * logo.height / logo.width});
  text(title, W / 2, 149, input.existing ? 14 : 16, true, INK, 'center');
  text(input.kind === 'voucher' ? 'GYM DEPOSIT REFUND' : 'REFUNDABLE GYM DEPOSIT', W / 2, 161, 7.3, false, MUTED, 'center');
  rule(169, MARGIN, right, GOLD, .7);
  text(input.kind === 'voucher' ? 'Voucher No.' : input.existing ? 'Original Receipt' : 'Receipt No.', MARGIN, 185, 8.2, false, MUTED);
  text(input.number, 110, 185, 9, true);
  text('Date', 393, 185, 8.2, false, MUTED);
  text(date, right, 185, 9, false, INK, 'right');

  const payerLines = wrapped(input.payer, boldLayout, 9, 276);
  const longName = payerLines.length > 2;
  const references = wrapped(input.reference || '-', regularLayout, 8.5, right - 450);
  let nameSize = 9;
  let names = payerLines;
  if (longName) {
    // Keep Member No. alongside the first line; later lines can use the full
    // width. The accepted 200-character names fit in four compact lines.
    const lineWidth = (line: number) => line < references.length ? 276 : right - 100;
    nameSize = 8.5;
    names = wrapped(input.payer, boldLayout, nameSize, lineWidth);
    while (names.length > 4 && nameSize > 6.5) {
      nameSize = Math.round((nameSize - .25) * 100) / 100;
      names = wrapped(input.payer, boldLayout, nameSize, lineWidth);
    }
  }
  const nameLeading = longName ? 9 : 10.5;
  text(input.kind === 'voucher' ? 'Paid to' : 'Received from', MARGIN, 202, 8.2, false, MUTED);
  names.forEach((name, i) => text(name, 100, 202 + i * nameLeading, nameSize, true));
  text('Member No.', 393, 202, 8.2, false, MUTED);
  references.forEach((reference, i) => text(reference, right, 202 + i * 10.5, 8.5, false, INK, 'right'));
  const metadataBottom = Math.max(202 + (names.length - 1) * nameLeading, 202 + (references.length - 1) * 10.5);

  const tableTop = metadataBottom + 9;
  page.drawRectangle({x: MARGIN, y: H - tableTop - 22, width: right - MARGIN, height: 22, color: PALE});
  text('DESCRIPTION', MARGIN + 10, tableTop + 14, 8.2, true);
  text('AMOUNT (RM)', right - 10, tableTop + 14, 8.2, true, INK, 'right');
  text(input.kind === 'voucher' ? 'Refund of gym deposit - Cash' : input.existing ? 'Existing refundable gym deposit - Cash' : 'Refundable gym deposit - Cash', MARGIN + 10, tableTop + 38, 9.3);
  text(Number(input.amount).toFixed(2), right - 10, tableTop + 38, 10.5, true, INK, 'right');
  const description = input.kind === 'voucher' ? input.legacyRefund ? null : `Original Deposit Receipt No.: ${input.originalReceipt}` : input.existing ? 'Recorded for tracking only. No new cash collection.' : 'Deposit held separately from the RM40 membership fee.';
  const descriptionLines = description === null ? [] : wrapped(description, regularLayout, 8.1, right - MARGIN - 20);
  descriptionLines.forEach((value, i) => text(value, MARGIN + 10, tableTop + 52 + i * 10, 8.1, false, MUTED));
  const totalTop = tableTop + 78 + Math.max(0, descriptionLines.length - 1) * 10;
  rule(totalTop - 17);
  text(amountWords(input.amount), MARGIN + 10, totalTop, 8.5, false, MUTED);
  text('TOTAL', right - 114, totalTop, 8.6, true, INK, 'right');
  text(`RM ${Number(input.amount).toFixed(2)}`, right - 10, totalTop + 1, 15, true, INK, 'right');

  const noticeTop = totalTop + 10;
  const notice = input.kind === 'voucher' ? recipientNote : input.existing ? 'This is an existing deposit record, not a newly issued cash receipt.' : 'Keep this receipt for your gym deposit refund.';
  const noticeLines = wrapped(notice, boldLayout, 8.3, right - MARGIN - 20);
  const noticeHeight = Math.max(22, noticeLines.length * 10 + 10);
  page.drawRectangle({x: MARGIN, y: H - noticeTop - noticeHeight, width: right - MARGIN, height: noticeHeight, color: NOTE});
  noticeLines.forEach((value, i) => text(value, MARGIN + 10, noticeTop + 14 + i * 10, 8.3, true));

  const staffTop = Math.max(350, noticeTop + noticeHeight + 20);
  const actorLines = wrapped(input.actor, boldLayout, 9.3, 235);
  actorLines.forEach((value, i) => text(value, 113, staffTop + i * 10.5, 9.3, true));
  text(input.kind === 'voucher' ? 'Refunded by:' : input.existing ? 'Recorded by:' : 'Received by:', MARGIN, staffTop, 8.2, false, MUTED);
  const signatureBottom = H - 386;
  const signatureHeight = Math.min(53, 386 - (noticeTop + noticeHeight + 7));
  if (signatureHeight < 25 || staffTop + (actorLines.length - 1) * 10.5 > 394) throw new Error('Document details are too long for the A5 document. Please shorten the member reference or staff name.');
  await drawSignature(pdf, page, input.signature, {x: 385, y: signatureBottom, width: 112, height: signatureHeight});
  const seal = await pdf.embedPng(companySealDataUrl);
  page.drawImage(seal, {x: 518, y: signatureBottom, width: 34, height: 34});
  rule(390, 378, right, RULE, .45);
  text(input.kind === 'voucher' ? 'Refunding staff signature' : input.existing ? 'Recorded by Management' : 'For K HOTEL SDN. BHD.', (378 + right) / 2, 401, 7.1, false, MUTED, 'center');
  text('KLG Campus Residence Management', W / 2, 413, 6.6, false, GOLD, 'center');
  return Buffer.from(await pdf.save());
}

export function depositReceiptPdf(data: DepositReceiptPdfData): Promise<Buffer> {
  return render({kind: 'receipt', number: data.receipt_no, date: data.received_on, payer: data.payer, reference: data.member_reference,
    amount: Number(data.amount), actor: data.received_by_name, signature: data.issuer_signature, existing: data.origin === 'existing', originalReceipt: data.original_receipt_no});
}

export function paymentVoucherPdf(data: PaymentVoucherPdfData): Promise<Buffer> {
  const legacyRefund = data.origin === 'legacy_refund';
  if (!legacyRefund && !clean(data.original_receipt_no || '')) return Promise.reject(new Error('The original deposit receipt number is required.'));
  return render({kind: 'voucher', number: data.voucher_no, date: data.paid_on, payer: data.payer, reference: data.member_reference,
    amount: Number(data.amount), actor: data.refunded_by_name, signature: data.refund_signature, originalReceipt: data.original_receipt_no, legacyRefund});
}
