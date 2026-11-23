import type { AbReportType, InspectionGroup } from "@/lib/flex-inspection";

type Block = "A" | "B" | "Other";
type Column = readonly [location: string, sourceColumn: string];
type Quantity = number | "1 CO2" | null;
type SourceRow = {
  row: number;
  label: string;
  level: number | null;
  quantities: readonly Quantity[];
  location?: string;
  levels?: readonly number[];
};

type InspectionPosition = {
  group: InspectionGroup;
  quantityLabel: string;
};

export type AbInspectionTable = {
  rowHeading: string;
  columnLabels: string[];
  rows: { label: string; positions: (InspectionPosition | null)[] }[];
};

export type AbInspectionSection = {
  block: Block;
  tables: AbInspectionTable[];
};

function levelRows(firstRow: number, quantities: readonly (readonly Quantity[])[]): SourceRow[] {
  return quantities.map((values, index) => ({
    row: firstRow + index,
    label: `Level ${index + 1}`,
    level: index + 1,
    quantities: values,
  }));
}

function room(row: number, location: string, quantities: readonly Quantity[], levels?: readonly number[]): SourceRow {
  return { row, label: location, level: null, quantities, location, levels };
}

function table(
  report: AbReportType,
  block: Block,
  columns: readonly Column[],
  sourceRows: SourceRow[],
  rowHeading = "Level",
): AbInspectionTable {
  return {
    rowHeading,
    columnLabels: columns.map(([location]) => location),
    rows: sourceRows.map((source) => ({
      label: source.label,
      positions: columns.map(([columnLocation, column], index) => {
        const value = source.quantities[index];
        if (value === undefined || value === null) return null;
        const co2 = value === "1 CO2";
        const quantity = co2 ? 1 : value;
        const sourceCell = `${column}${source.row}`;
        const id = `ab-${report}-${block.toLowerCase()}-${sourceCell.toLowerCase()}`;
        const note = quantity === 0
          ? (report === "exit-sign" ? "No exit light" : "No emergency light")
          : undefined;

        return {
          quantityLabel: String(value),
          group: {
            id,
            report,
            block,
            level: source.level ?? source.levels?.[index] ?? null,
            location: source.location ?? columnLocation,
            quantity,
            sourceCell,
            note,
            units: Array.from({ length: quantity }, (_, index) => ({
              id: `${id}-${index + 1}`,
              label: co2 ? "CO2 extinguisher" : `Unit ${index + 1}`,
            })),
          },
        };
      }),
    })),
  };
}

const lobby = ["Lobby", "B"] as const;
const hoseColumns = [["Wing A", "B"], ["Wing B", "E"]] as const;
const hoseQuantities = Array.from({ length: 8 }, () => [1, 1]);
const extinguisherColumns = [lobby, ["Centre Staircase", "F"], ["Corridor Wing A", "H"], ["Corridor Wing B", "J"]] as const;
const otherSiteColumns = [["Level 1", "B"], ["Level 2", "F"], ["Level 3", "H"]] as const;
const roomQuantityColumns = [["Quantity", "B"]] as const;
const extinguisher = "fire-extinguisher";
const exitSign = "exit-sign";
const emergency = "emergency-light";

// October 2026 workbook quantities, by sheet cell. null means no equipment
// listed for that location. An explicit 0 marks a known missing position.
export const AB_INSPECTION_CATALOG: Record<AbReportType, AbInspectionSection[]> = {
  "hose-reel": [
    { block: "A", tables: [table("hose-reel", "A", hoseColumns, levelRows(6, hoseQuantities))] },
    { block: "B", tables: [table("hose-reel", "B", hoseColumns, levelRows(21, hoseQuantities))] },
  ],
  [extinguisher]: [
    {
      block: "A",
      tables: [
        table(extinguisher, "A", extinguisherColumns, levelRows(9, [
          [1, null, 4, 3], [1, 1, 4, 4], [1, 1, 4, 4], [1, 1, 4, 4],
          [1, 1, 3, 4], [1, 1, 4, 3], [1, 1, 4, 4], [1, 1, 3, 3],
        ])),
        table(extinguisher, "A", roomQuantityColumns, [
          room(18, "Server Room", ["1 CO2"]),
          room(19, "Pump House", ["1 CO2"]),
          room(20, "Lift Motor Room", ["1 CO2"]),
        ], "Location"),
      ],
    },
    {
      block: "B",
      tables: [
        table(extinguisher, "B", extinguisherColumns, levelRows(30, [
          [2, null, 3, 4], [1, 1, 4, 4], [1, 1, 4, 4], [1, 1, 4, 4],
          [1, 1, 4, 4], [1, 1, 3, 3], [1, 1, 3, 3], [1, 1, 3, 4],
        ])),
        table(extinguisher, "B", roomQuantityColumns, [
          room(39, "Server Room", ["1 CO2"]),
          room(40, "MDF Room", ["1 CO2"]),
          room(41, "FAP Room", ["1 CO2"]),
          room(42, "Lift Motor Room", ["1 CO2"]),
        ], "Location"),
      ],
    },
    {
      block: "Other",
      tables: [table(extinguisher, "Other", otherSiteColumns, [
        room(50, "Bungalow XA3", [1, 1, 1], [1, 2, 3]),
        room(51, "Gymnasium", [1]),
      ], "Location")],
    },
  ],
  [exitSign]: [
    {
      block: "A",
      tables: [table(exitSign, "A", [
        lobby, ["Visitor Room", "F"], ["Main Storage Room", "H"], ["Staircase Centre", "J"],
        ["Corridor Wing A", "L"], ["Staircase Wing A", "N"], ["Corridor Wing B", "P"], ["Staircase Wing B", "R"],
      ], levelRows(6, [
        [1, 1, 1, 1, 1, 1, 1, 1],
        ...Array.from({ length: 7 }, () => [null, null, null, 1, 1, 1, 1, 1]),
      ]))],
    },
    {
      block: "B",
      tables: [table(exitSign, "B", [
        lobby, ["Staircase Centre", "F"], ["Corridor Wing A", "H"], ["Staircase Wing A", "J"],
        ["Corridor Wing B", "L"], ["Staircase Wing B", "N"], ["Surau", "P"], ["Indoor Game Room", "R"],
      ], levelRows(21, [
        [1, 1, 1, 1, 1, 1, 1, 1],
        ...Array.from({ length: 6 }, () => [null, 1, 1, 1, 1, 1]),
        [null, 1, 1, 0, 1, 1],
      ]))],
    },
  ],
  [emergency]: [
    {
      block: "A",
      tables: [table(emergency, "A", [
        lobby, ["Lift Motor Room", "F"], ["Surau", "H"], ["Visitor Room", "J"], ["Staircase Centre", "L"],
        ["Corridor Wing A", "N"], ["Staircase Wing A", "P"], ["Corridor Wing B", "R"], ["Staircase Wing B", "T"],
      ], levelRows(6, [
        [1, null, 1, 2, 1, 2, null, 3, null], [1, null, null, null, 1, 3, 1, 1, 1],
        [1, null, null, null, 1, 2, 1, 2, 1], [0, null, null, null, 1, 2, 1, 2, 1],
        [1, null, null, null, 1, 2, 1, 2, 1], [1, null, null, null, 1, 1, 1, 1, 1],
        [1, null, null, null, 1, 1, 1, 0, 1], [1, null, null, null, null, 1, 1, 1, 1],
        [null, 1],
      ]))],
    },
    {
      block: "B",
      tables: [table(emergency, "B", [
        lobby, ["Lift Motor Room", "F"], ["Surau", "H"], ["Staircase Centre", "J"], ["Corridor Wing A", "L"],
        ["Staircase Wing A", "N"], ["Corridor Wing B", "P"], ["Staircase Wing B", "R"], ["Indoor Game Room", "T"],
      ], levelRows(22, [
        [1, null, null, 1, 1, null, 1, null, 1], [1, null, null, 1, 1, 1, 1, 1],
        [1, null, null, 1, 2, 1, 2, 1], [1, null, null, 1, 2, 1, 2, 1],
        [1, null, null, 1, 2, 1, 2, 1], [1, null, null, 1, 1, 1, 1, 1],
        [1, null, null, 1, 1, 1, 1, 1], [1, null, null, 1, 1, 1, 1, 1],
        [null, 1],
      ]))],
    },
    {
      block: "Other",
      tables: [table(emergency, "Other", otherSiteColumns, [room(38, "Bungalow XA3", [1, 1, 1], [1, 2, 3])], "Location")],
    },
  ],
};

export function loadAbInspectionGroups(): InspectionGroup[] {
  return Object.values(AB_INSPECTION_CATALOG).flatMap(sections =>
    sections.flatMap(section =>
      section.tables.flatMap(table =>
        table.rows.flatMap(row =>
          row.positions.flatMap(position => position ? [position.group] : []),
        ),
      ),
    ),
  );
}
