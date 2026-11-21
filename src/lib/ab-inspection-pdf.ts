import { PageSizes, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import {
  AB_REPORT_LABELS,
  isFlexPeriod,
  type AbReportType,
  type FlexInspectionSnapshot,
} from "@/lib/flex-inspection";
import { AB_INSPECTION_CATALOG, type AbInspectionTable } from "@/lib/ab-inspection-catalog";
import { signatureSchema } from "@/lib/purchase-orders/signature";
import { smoothSignatureStroke } from "@/lib/purchase-orders/signature-drawing";

const margin = 28;
const ink = rgb(0.12, 0.15, 0.14);
const border = rgb(0.70, 0.73, 0.72);
const muted = rgb(0.31, 0.34, 0.33);
const header = rgb(0.94, 0.95, 0.94);
const white = rgb(1, 1, 1);
const fault = rgb(0.65, 0.08, 0.13);
const faultBackground = rgb(1, 0.94, 0.94);
const absent = rgb(0.94, 0.94, 0.94);
const pen = rgb(0.09, 0.24, 0.55);
const blockColors = { A: rgb(0.77, 0.10, 0.13), B: rgb(0.02, 0.47, 0.24), Other: rgb(0.27, 0.39, 0.50) };

type TextBox = { x: number; y: number; width: number; height: number };
type Ink = ReturnType<typeof rgb>;

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeZone: "UTC" });

function printable(value: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  const normalized = value.replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  return Array.from(normalized, (character) => {
    if (supported.has(character.codePointAt(0)!) || character === "\n") return character;
    const plain = character.normalize("NFD").replace(/\p{Mark}/gu, "");
    return plain && Array.from(plain).every(letter => supported.has(letter.codePointAt(0)!))
      ? plain
      : "?";
  }).join("");
}

function wrapText(text: string, width: number, font: PDFFont, size: number): string[] {
  return text.split("\n").flatMap(paragraph => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const combined = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(combined, size) <= width) {
        line = combined;
      } else {
        if (line) lines.push(line);
        line = "";
        for (const char of word) {
          if (line && font.widthOfTextAtSize(line + char, size) > width) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      }
    }
    return [...lines, line];
  });
}

function label(page: PDFPage, font: PDFFont, value: string, box: TextBox, options: {
  size: number; color?: Ink; align?: "centre" | "left"; wrap?: boolean;
}) {
  const text = printable(value, font).trim();
  if (!text) return;
  const width = box.width - 6;
  const lines = options.wrap ? wrapText(text, width, font, options.size) : [text];
  const maxWidth = Math.max(...lines.map(line => font.widthOfTextAtSize(line, options.size)));
  const size = options.size * Math.min(1, width / maxWidth, (box.height - 3) / (lines.length * options.size * 1.14));
  const lineHeight = size * 1.14;
  const top = box.y + (box.height + lines.length * lineHeight) / 2;
  lines.forEach((line, index) => {
    const x = options.align === "left"
      ? box.x + 4
      : box.x + (box.width - font.widthOfTextAtSize(line, size)) / 2;
    page.drawText(line, { x, y: top - size - index * lineHeight, size, font, color: options.color ?? ink });
  });
}

function drawCheck(page: PDFPage, box: TextBox) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const elbow = { x: x - 0.8, y: y - 2.1 };
  page.drawLine({ start: { x: x - 3.4, y: y + 0.4 }, end: elbow, thickness: 1, color: blockColors.B });
  page.drawLine({ start: elbow, end: { x: x + 3.9, y: y + 3.3 }, thickness: 1, color: blockColors.B });
}

function reportTitle(report: AbReportType, period: string) {
  if (!isFlexPeriod(period)) throw new Error("Invalid inspection report month.");
  const month = monthFormat.format(new Date(`${period}-01T00:00:00Z`)).toUpperCase();
  return `${AB_REPORT_LABELS[report].toUpperCase()} INSPECTION (BLOCK A & B) - ${month}`;
}

function drawTable(
  page: PDFPage,
  fonts: { body: PDFFont; bold: PDFFont },
  table: AbInspectionTable,
  report: AbReportType,
  inspection: FlexInspectionSnapshot,
  startY: number,
) {
  const width = page.getWidth() - margin * 2;
  const isHose = report === "hose-reel";
  const isRoomTable = table.columnLabels[0] === "Quantity";
  const leftWidth = isHose ? 100 : isRoomTable || table.rowHeading === "Location" ? 113 : 77;
  const bodyHeight = isHose ? 28 : 11.5;
  const headerHeight = isHose ? 30 : 21;
  const columnWidth = isRoomTable ? (width - leftWidth) / 4 : (width - leftWidth) / table.columnLabels.length;
  const quantityWidth = columnWidth * 0.46;
  const bodySize = isHose ? 10 : 7.5;
  let y = startY;
  let total = 0;
  function gridCell(x: number, cellWidth: number, height: number, fill: Ink) {
    const box = { x, y: y - height, width: cellWidth, height };
    page.drawRectangle({ ...box, color: fill, borderColor: border, borderWidth: 0.45 });
    return box;
  }

  if (!isRoomTable) {
    label(page, fonts.bold, table.rowHeading.toUpperCase(), gridCell(margin, leftWidth, headerHeight, header), {
      size: bodySize, align: "left",
    });
    table.columnLabels.forEach((location, index) => {
      const x = margin + leftWidth + index * columnWidth;
      label(page, fonts.bold, location.toUpperCase(), gridCell(x, quantityWidth, headerHeight, header), {
        size: bodySize, wrap: true,
      });
      label(page, fonts.bold, "STATUS", gridCell(x + quantityWidth, columnWidth - quantityWidth, headerHeight, header), {
        size: bodySize,
      });
    });
    y -= headerHeight;
  }

  for (const row of table.rows) {
    label(page, fonts.body, row.label, gridCell(margin, leftWidth, bodyHeight, white), { size: bodySize, align: "left" });
    row.positions.forEach((position, index) => {
      const x = margin + leftWidth + index * columnWidth;
      const group = position?.group;
      const faults = group?.units.filter(unit => Object.hasOwn(inspection.exceptions, unit.id)).length ?? 0;
      const isFault = faults > 0 || group?.quantity === 0;
      const fill = isFault ? faultBackground : group ? white : absent;
      const quantityBox = gridCell(x, quantityWidth, bodyHeight, fill);
      const statusBox = gridCell(x + quantityWidth, columnWidth - quantityWidth, bodyHeight, fill);
      if (!position || !group) return;

      total += group.quantity;
      if (isHose && !isFault) drawCheck(page, quantityBox);
      else label(page, fonts.body, isHose ? "X" : position.quantityLabel, quantityBox, { size: bodySize, color: isFault ? fault : ink });
      if (group.note) label(page, fonts.body, group.note, statusBox, { size: bodySize, color: fault });
      else if (faults) {
        const text = isHose ? "See remarks" : faults === group.quantity ? "X" : `${group.quantity - faults} OK / ${faults} X`;
        label(page, fonts.bold, text, statusBox, { size: bodySize, color: fault });
      } else if (report === "fire-extinguisher") drawCheck(page, statusBox);
      else label(page, fonts.body, isHose ? "Clean" : "Function", statusBox, { size: bodySize });
    });
    if (isRoomTable) gridCell(margin + leftWidth + columnWidth, width - leftWidth - columnWidth, bodyHeight, absent);
    y -= bodyHeight;
  }

  label(page, fonts.bold, "TOTAL", gridCell(margin, leftWidth, bodyHeight, header), { size: bodySize, align: "left" });
  label(page, fonts.bold, String(total), gridCell(margin + leftWidth, width - leftWidth, bodyHeight, header), {
    size: bodySize, align: "left",
  });
  return y - bodyHeight;
}

async function drawInspector(
  pdf: PDFDocument, page: PDFPage, font: PDFFont, top: number,
  inspection: FlexInspectionSnapshot, signatureValue: unknown,
) {
  const date = inspection.inspectionDate ? dateFormat.format(new Date(`${inspection.inspectionDate}T00:00:00Z`)) : "";
  const left = { x: margin, y: top - 12, width: page.getWidth() - margin * 2 - 145, height: 12 };
  label(page, font, `Inspected by  ${inspection.inspectedByName ?? ""}`, left, { size: 8.5, align: "left" });
  label(page, font, `Inspection date  ${date}`, { ...left, y: left.y - 12 }, { size: 8.5, align: "left" });

  const signature = signatureSchema.safeParse(signatureValue);
  if (!signature.success) return;
  const x = page.getWidth() - margin - 110;
  const y = top - 24;
  if (signature.data.imageDataUrl) {
    const image = await pdf.embedPng(Buffer.from(signature.data.imageDataUrl.slice(22), "base64"));
    page.drawImage(image, { x, y, ...image.scaleToFit(108, 26) });
    return;
  }
  for (const stroke of signature.data.strokes) {
    const points = smoothSignatureStroke(stroke).map(([px, py]) => ({ x: x + px * 110, y: y + (1 - py) * 26 }));
    points.slice(1).forEach((end, index) => page.drawLine({ start: points[index], end, thickness: 0.9, color: pen }));
  }
}

function drawFaultRemarks(
  pdf: PDFDocument, fonts: { body: PDFFont; bold: PDFFont }, report: AbReportType, inspection: FlexInspectionSnapshot,
) {
  const faults = AB_INSPECTION_CATALOG[report].flatMap(section => section.tables.flatMap(table =>
    table.rows.flatMap(row => row.positions.flatMap(position => {
      if (!position) return [];
      const { group } = position;
      const place = [group.block === "Other" ? null : `Block ${group.block}`,
        group.level === null ? null : `Level ${group.level}`, group.location].filter(Boolean).join(" / ");
      return group.units.filter(unit => Object.hasOwn(inspection.exceptions, unit.id)).map(unit => ({
        heading: `${place} / ${unit.label}`,
        remark: inspection.exceptions[unit.id],
      }));
    })),
  ));
  if (!faults.length) return;

  const width = PageSizes.A4[0] - margin * 2;
  const bodySize = 10;
  const remarkLineHeight = 13;
  const remarkHeaderHeight = 24;
  let top = 0;
  function nextPage() {
    const page = pdf.addPage(PageSizes.A4);
    label(page, fonts.bold, `${AB_REPORT_LABELS[report]} fault remarks`, {
      x: margin, y: page.getHeight() - margin - 24, width, height: 24,
    }, { size: 16, align: "left" });
    label(page, fonts.body, `Block A & B   /   ${monthFormat.format(new Date(`${inspection.period}-01T00:00:00Z`))}`, {
      x: margin, y: page.getHeight() - margin - 38, width, height: 14,
    }, { size: 9, color: muted, align: "left" });
    top = page.getHeight() - margin - 50;
    return page;
  }

  let page = nextPage();
  for (const item of faults) {
    const remark = printable(item.remark, fonts.body).trim().replace(/\n(?: *\n){2,}/g, "\n\n");
    const lines = wrapText(remark, width - 16, fonts.body, bodySize);
    for (let start = 0; start < lines.length;) {
      if (top - margin < remarkHeaderHeight + remarkLineHeight) page = nextPage();
      const capacity = Math.floor((top - margin - remarkHeaderHeight) / remarkLineHeight);
      const visible = lines.slice(start, start + capacity);
      const height = visible.length * remarkLineHeight + remarkHeaderHeight;
      page.drawRectangle({ x: margin, y: top - height, width, height, borderWidth: 0.55, borderColor: border });
      const title = start ? `${item.heading} (continued)` : item.heading;
      label(page, fonts.bold, title, { x: margin + 4, y: top - 17, width: width - 8, height: 15 }, {
        size: 10, align: "left",
      });
      visible.forEach((line, index) => page.drawText(line, {
        x: margin + 8, y: top - 27 - index * remarkLineHeight, size: bodySize, font: fonts.body, color: ink,
      }));
      top -= height + 7;
      start += visible.length;
    }
  }
}

export async function generateAbInspectionPdf(
  report: AbReportType, inspection: FlexInspectionSnapshot, inspectorSignature?: unknown,
): Promise<Uint8Array> {
  const title = reportTitle(report, inspection.period);
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const isHose = report === "hose-reel";
  const page = pdf.addPage(isHose ? PageSizes.A4 : [PageSizes.A4[1], PageSizes.A4[0]]);
  const width = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin - 24;
  label(page, fonts.bold, title, { x: margin, y, width, height: 24 }, { size: isHose ? 15 : 14 });
  y -= 5;

  for (const section of AB_INSPECTION_CATALOG[report]) {
    const height = isHose ? 26 : 15;
    y -= height;
    const box = { x: margin, y, width, height };
    page.drawRectangle({ ...box, color: blockColors[section.block] });
    const title = section.block === "Other" ? "OTHERS" : `BLOCK ${section.block}`;
    label(page, fonts.bold, title, box, { size: isHose ? 12 : 9.5, color: white });
    for (const table of section.tables) {
      y = drawTable(page, fonts, table, report, inspection, y);
    }
    y -= isHose ? 14 : 6;
  }
  await drawInspector(pdf, page, fonts.body, y, inspection, inspectorSignature);
  drawFaultRemarks(pdf, fonts, report, inspection);
  return pdf.save();
}

export async function generateAbInspectionReportPack(
  inspection: FlexInspectionSnapshot, inspectorSignature?: unknown,
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  merged.setTitle(`Block A & B Fire Safety Inspection - ${inspection.period}`);
  for (const report of Object.keys(AB_REPORT_LABELS) as AbReportType[]) {
    const document = await PDFDocument.load(await generateAbInspectionPdf(report, inspection, inspectorSignature));
    const pages = await merged.copyPages(document, document.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return merged.save();
}
