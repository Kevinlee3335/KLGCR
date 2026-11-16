import type { FlexGroup, FlexReportType } from '../flex-inspection';

export type Rect = readonly [left: number, top: number, right: number, bottom: number];

type ReportLayout = {
  referenceSize: readonly [number, number];
  pageSize: [number, number];
  statusColumns: Record<string, readonly [number, number]>;
  statusRows: ReadonlyArray<readonly [firstSheetRow: number, boundaries: readonly number[]]>;
  month: Rect;
  inspector: Rect;
  date: Rect;
  signature: Rect;
  stamp: Rect;
  title: string;
};

// Coordinates are measured on the upright original scans scaled to a longest
// side of 1450 px. The source quantity cell is directly left of each status.
export const REPORT_LAYOUTS: Record<FlexReportType, ReportLayout> = {
  'fire-extinguisher': {
    referenceSize: [1025, 1450],
    pageSize: [595.44, 842.4],
    statusColumns: { B: [312, 399], F: [501, 598], H: [701, 798], J: [901, 998] },
    statusRows: [
      [5, [220, 250, 280, 310, 339, 369, 398, 428, 457, 487, 516, 546, 576, 606]],
      [22, [725, 755, 784, 814, 843, 873, 902, 932, 961, 991, 1021, 1051, 1080]],
    ],
    month: [655, 109, 813, 132],
    inspector: [225, 1293, 383, 1307],
    date: [225, 1316, 383, 1331],
    signature: [223, 1240, 384, 1309],
    stamp: [390, 1250, 501, 1360],
    title: 'Extinguisher Inspection Block C & D',
  },
  'exit-sign': {
    referenceSize: [1450, 1025],
    pageSize: [842.4, 595.44],
    statusColumns: {
      B: [345, 437], E: [533, 625], G: [720, 812], I: [907, 999], K: [1095, 1188], M: [1283, 1375],
    },
    statusRows: [
      [5, [233, 256, 280, 303, 326, 350, 374, 397, 420, 445]],
      [18, [588, 612, 636, 659, 683, 706, 730, 754, 777, 801, 825]],
    ],
    month: [848, 81, 1024, 105],
    inspector: [273, 874, 497, 892],
    date: [273, 898, 497, 915],
    signature: [271, 849, 495, 894],
    stamp: [501, 863, 612, 974],
    title: 'Exit Sign Inspection Block C & D',
  },
  'emergency-light': {
    referenceSize: [1450, 1025],
    pageSize: [842.4, 595.44],
    statusColumns: {
      B: [325, 422], E: [523, 602], G: [701, 812], I: [912, 1017], K: [1116, 1196], M: [1295, 1375],
    },
    statusRows: [
      [5, [198, 223, 247, 271, 296, 320, 345, 369, 409, 433, 457, 482]],
      [20, [638, 663, 688, 712, 737, 761, 786, 810, 834, 859, 883, 908]],
    ],
    month: [870, 44, 1022, 67],
    inspector: [254, 949, 452, 969],
    date: [254, 975, 452, 992],
    signature: [252, 933, 452, 970],
    stamp: [457, 909, 568, 1020],
    title: 'Emergency Light Inspection Block C & D',
  },
};

export function flexStatusCell(group: FlexGroup): Rect {
  const address = /([A-Z]+)(\d+)$/i.exec(group.sourceCell);
  if (address) {
    const layout = REPORT_LAYOUTS[group.report];
    const column = layout.statusColumns[address[1].toUpperCase()];
    const sheetRow = Number(address[2]);
    for (const [firstRow, boundaries] of layout.statusRows) {
      const offset = sheetRow - firstRow;
      if (column && offset >= 0 && offset < boundaries.length - 1) {
        return [column[0], boundaries[offset], column[1], boundaries[offset + 1]];
      }
    }
  }
  throw new Error(`No Flex PDF status cell for ${group.report} ${group.sourceCell}`);
}
