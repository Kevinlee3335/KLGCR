/** Pure parser for the detailed UTMSPACE room-defect report, not its summary tables.
 * Lines must be supplied in reading order. Coordinates are retained unchanged so
 * the PDF extraction layer can associate the original photographs with each DF.
 */
export type CheckoutPdfLine = { text: string; x: number; y: number };
export type CheckoutPdfPage = { pageNumber: number; lines: CheckoutPdfLine[]; width: number; height: number };

export type CheckoutPdfDefect = {
  sourceId: string;
  inspectionId?: string;
  originalItem: string;
  originalFinding: string;
  originalAction?: string;
  translatedAction?: string;
  sourceStatus: string;
  sourceStatusEnglish?: string;
  description: string;
  title: string;
  /** ISO date of the reported defect, never the PDF print date or repair target. */
  reportedDate?: string;
  pageNumber: number;
  y: number;
  needsReview: boolean;
  reviewReason?: string;
  expectedQuantity?: number;
  presentQuantity?: number;
  missingQuantity?: number;
  conflictingDetails?: { originalItem: string; originalFinding: string; originalAction?: string; sourceStatus: string; pageNumber: number; y: number }[];
};
export type CheckoutPdfRoom = { blockCode: "A" | "B"; roomNo: string; level?: string; defects: CheckoutPdfDefect[] };
export type CheckoutPdfSkippedRoom = { blockCode: string; roomNo: string; defectCount: number; reason: string };
export type CheckoutPdfParseResult = { rooms: CheckoutPdfRoom[]; warnings: string[]; skippedRooms: CheckoutPdfSkippedRoom[] };
export type CheckoutPdfDetailHeading = { sourceId: string; blockCode: string; roomNo: string; level: string; originalItem: string };
export type CheckoutPdfTranslation = Pick<CheckoutPdfDefect, "description" | "title" | "needsReview" | "reviewReason" | "expectedQuantity" | "presentQuantity" | "missingQuantity">;

const clean = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const key = (value: string) => clean(value).toLowerCase().replace(/[.!]+$/, "");
const sourceIdPattern = /\bDF[-\u2010-\u2014]\d{4}[-\u2010-\u2014]\d+\b/i;
const canonicalId = (value: string) => value.replace(/[\u2010-\u2014]/g, "-").toUpperCase();

/** Also used by the browser extractor to anchor before/after evidence. */
export function parseCheckoutPdfDetailHeading(text: string): CheckoutPdfDetailHeading | null {
  const match = clean(text).match(/^(DF[-\u2010-\u2014]\d{4}[-\u2010-\u2014]\d+)\s+[\u2013\u2014-]\s+(?:Blok\s+)?([A-Z0-9]+)\s*\/\s*Aras\s+([^/]+?)\s*\/\s*(.+?)\s+[\u2013\u2014-]\s+(.+)$/i);
  if (!match) return null;
  return {
    sourceId: canonicalId(match[1]), blockCode: match[2].toUpperCase(),
    level: clean(match[3]), roomNo: clean(match[4]).toUpperCase(), originalItem: clean(match[5]),
  };
}

const items: Record<string, string> = {
  "kebersihan lantai": "Floor", lantai: "Floor", floor: "Floor",
  "kebersihan dinding": "Wall", dinding: "Wall", wall: "Wall",
  "kebersihan siling": "Ceiling", siling: "Ceiling", ceiling: "Ceiling",
  "bau pengudaraan": "Room", tandas: "Toilet", toilet: "Toilet", shower: "Shower",
  almari: "Wardrobe", "almari pakaian": "Wardrobe", wardrobe: "Wardrobe",
  sinki: "Sink", sink: "Sink", kipas: "Fan", fan: "Fan", pintu: "Door", door: "Door",
  "paip air": "Water tap", meja: "Table", table: "Table", "rak buku": "Bookshelf",
  "floor trap": "Floor trap", lampu: "Light", pendawaian: "Wiring", katil: "Bed",
  tilam: "Mattress", kerusi: "Chair", tingkap: "Window", langsir: "Curtain", kebocoran: "Water leakage",
};
const conditions: Record<string, string> = {
  kotor: "dirty", "meja kotor": "dirty", dirty: "dirty", kulat: "moldy", moldy: "moldy", mouldy: "moldy",
  "kotor kulat": "dirty and moldy", "kotor dan kulat": "dirty and moldy",
  "cat terkopek dinding kulat": "moldy and paint peeling", "cat terkopek": "paint peeling",
  bocor: "leaking", leaking: "leaking", loose: "loose", berhabuk: "dusty",
  "kotor habuk": "dirty and dusty", "habuk sikit": "slightly dusty", "habuk n rambut": "dust and hair present",
  "kulat dan ada air": "moldy with water present", "kulat dua2": "moldy (both)",
  "kotor dan ada barang": "dirty with belongings left behind", "kulat dan ada barang": "moldy with belongings left behind",
  "ada barang": "belongings left behind", "tinggalkan barang": "belongings left behind",
  "baju & sampah": "clothes and rubbish left behind", rambut: "hair present", sawang: "cobwebs present",
  kembang: "bloated", pecah: "broken", patah: "broken", rosak: "broken", tersumbat: "clogged",
  tercabut: "detached", lubang: "hole present", sepah: "untidy", "ada sedikit kerosakan": "minor damage",
  "baru naik kulat": "mold starting to appear", "kulat teruk": "severely moldy",
  "blakang almari start kulat": "mold starting to appear at the back",
  "water pressure low": "low water pressure", "tekanan air perlahan": "low water pressure",
  "tak berfungsi": "not working", "lampu mati": "not working", "open wire": "exposed wire",
  "cover chiped": "cover chipped", "susah nk tutup": "difficult to close",
  "pakai langsir lain": "different curtain fitted", "wall stain": "stained",
};

function reviewTranslation(roomNo: string, reason: string, description = ""): CheckoutPdfTranslation {
  return { description, title: description ? `${description} ${roomNo}` : `English translation required ${roomNo}`, needsReview: true, reviewReason: reason };
}

/** Uses explicit known terms. Unknown/ambiguous text is retained in the source
 * fields and requires a human English description rather than a guessed repair.
 */
export function translateCheckoutPdfFinding(originalItem: string, originalFinding: string, roomNo: string): CheckoutPdfTranslation {
  const itemText = clean(originalItem).replace(/^Inventori\s*:\s*/i, "");
  const item = items[key(itemText)];
  const finding = key(originalFinding);
  if (!item) return reviewTranslation(roomNo, `Translate the unrecognised item: ${clean(originalItem)}`);
  if (!finding) return reviewTranslation(roomNo, "The source finding is missing.");

  const inventory = clean(originalFinding).match(/^(.+?):\s*dijangka\s+(\d+)\s*,\s*ada\s+(\d+)\s*\(\s*kurang\s+(\d+)\s*\)(?:\s*[\u2013\u2014-]\s*(.*))?$/i);
  if (inventory) {
    const quantityItem = items[key(inventory[1])];
    const expectedQuantity = Number(inventory[2]), presentQuantity = Number(inventory[3]), missingQuantity = Number(inventory[4]);
    if (quantityItem !== item || !Number.isSafeInteger(expectedQuantity) || !Number.isSafeInteger(presentQuantity) || !Number.isSafeInteger(missingQuantity)
      || expectedQuantity < 1 || presentQuantity < 0 || missingQuantity < 1 || expectedQuantity - presentQuantity !== missingQuantity) {
      return reviewTranslation(roomNo, "The source inventory quantities or item names are inconsistent.");
    }
    const note = clean(inventory[5] || "");
    const description = `${item} missing (Qty ${missingQuantity}; expected ${expectedQuantity}, present ${presentQuantity})`;
    return {
      description, title: `${item} missing ${missingQuantity} ${roomNo}`, expectedQuantity, presentQuantity, missingQuantity,
      needsReview: !!note && !/^klg$/i.test(note),
      ...(note && !/^klg$/i.test(note) ? { reviewReason: `Review the original inventory note: ${note}` } : {}),
    };
  }

  let description = "";
  if (item === "Room" && ["bilik berbau", "berbau"].includes(finding)) description = "Room bad smell";
  else if (item === "Room" && finding === "hapak") description = "Room musty smell";
  else if (item === "Door" && finding === "missing door closer") description = "Door closer missing";
  else if (item === "Water tap" && finding === "hose tidak dalam keadaan sepatutnya") description = "Water hose not in proper condition";
  else if (item === "Sink" && finding === "pili loose") description = "Sink tap loose";
  else if (finding === "terkopek") {
    if (["Wall", "Ceiling", "Door"].includes(item)) description = `${item} paint peeling`;
    else if (["Table", "Wardrobe", "Bookshelf"].includes(item)) description = `${item} surface peeling`;
  } else if (item === "Water leakage" && finding === "toilet bowl running") description = "Toilet running continuously";
  else if (item === "Light" && finding === "lampu meja belajar rosak") description = "Study table light not working";
  else if (item === "Light" && finding === "suis akan menyalakan lampu tandas dan luar tandas..hanya lampu luar tandas rosak") {
    description = "Light outside toilet not working; switch controls toilet and outside lights";
  } else if (conditions[finding]) description = `${item} ${conditions[finding]}`;
  if (!description) return reviewTranslation(roomNo, `Translate or clarify the source finding: ${clean(originalFinding)}`);
  return { description, title: `${description} ${roomNo}`, needsReview: false };
}

function actionTranslation(action: string): string | undefined {
  const value = key(action);
  const supply = value.match(/^ganti\s*\/\s*bekalkan\s+(\d+)\s+unit$/);
  if (supply) return `Replace / supply ${Number(supply[1])} unit${Number(supply[1]) === 1 ? "" : "s"}`;
  if (value === "cat masih terkopek") return "Paint still peeling";
  return undefined;
}
const statuses: Record<string, string> = {
  baru: "New", "belum dibaiki": "Not repaired", "dalam tindakan": "In progress", selesai: "Completed", disahkan: "Verified",
};

function isoDate(value: string): string | undefined {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : undefined;
}

type SourceMetadata = { reportedDate?: string; inspectionId?: string };
type Active = CheckoutPdfDetailHeading & SourceMetadata & {
  pageNumber: number; y: number; originalFinding: string; originalAction: string; sourceStatus: string;
  field: "originalFinding" | "originalAction" | "sourceStatus" | null;
};

function runningLine(text: string) {
  return /^(?:https?:\/\/|\d+\s*\/\s*\d+$)/i.test(text)
    || /Sistem Pemeriksaan Bilik\s*$/i.test(text) || /^SEKSYEN FASILITI$/i.test(text);
}

export function parseCheckoutPdfPages(pages: CheckoutPdfPage[]): CheckoutPdfParseResult {
  const orderedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const metadata = new Map<string, SourceMetadata>();
  // The table provides the reported date; it does not create defects. Never use
  // the report's generated date, repair due date or subsequent status-log date.
  for (const page of orderedPages) {
    let previousTableId: string | undefined;
    let tableRoomKey: string | undefined;
    for (const line of page.lines) {
      const text = clean(line.text);
      const roomHeading = text.match(/^Bilik\s+([AB][ -]?\d{3})\b.*?Blok\s*\/\s*Aras\s+Blok\s+([AB])\s*\/\s*Aras\s+/i);
      if (roomHeading) tableRoomKey = `${roomHeading[2].toUpperCase()}/${roomHeading[1].replace(/[ -]/g, "").toUpperCase()}`;
      const id = text.match(sourceIdPattern);
      if (id) {
        previousTableId = undefined;
        if (parseCheckoutPdfDetailHeading(text)) continue;
        const date = text.slice((id.index || 0) + id[0].length).match(/\b\d{2}\/\d{2}\/\d{4}\b/);
        if (date) {
          const identity = `${tableRoomKey || "unscoped"}/${canonicalId(id[0])}`;
          metadata.set(identity, { ...metadata.get(identity), reportedDate: isoDate(date[0]) });
          previousTableId = identity;
        }
      } else if (previousTableId) {
        const inspection = text.match(/^PM-\d{4}-\d+\b/i);
        if (inspection) {
          metadata.set(previousTableId, { ...metadata.get(previousTableId), inspectionId: canonicalId(inspection[0]) });
          previousTableId = undefined;
        } else if (text && !runningLine(text)) previousTableId = undefined;
      }
    }
  }

  const rooms = new Map<string, CheckoutPdfRoom>();
  const skipped = new Map<string, CheckoutPdfSkippedRoom>();
  const ids = new Map<string, CheckoutPdfDefect>();
  const sourceRooms = new Map<string, { defect: CheckoutPdfDefect; roomKey: string }[]>();
  const warnings: string[] = [];
  let active: Active | null = null;

  function finish() {
    if (!active) return;
    const source = active;
    active = null;
    const canonicalRoom = source.roomNo.replace(/[ -]/g, "");
    const validRoom = /^[AB]\d{3}$/i.test(canonicalRoom) && canonicalRoom[0] === source.blockCode;
    if (!["A", "B"].includes(source.blockCode) || !validRoom) {
      const skipKey = `${source.blockCode}/${source.roomNo}`;
      const previous = skipped.get(skipKey);
      const reason = !["A", "B"].includes(source.blockCode) ? "Outside Block A / B import scope" : "Room number does not match Block A / B";
      skipped.set(skipKey, { blockCode: source.blockCode, roomNo: source.roomNo, defectCount: (previous?.defectCount || 0) + 1, reason });
      return;
    }
    const translation = translateCheckoutPdfFinding(source.originalItem, source.originalFinding, canonicalRoom);
    const sourceStatus = clean(source.sourceStatus);
    const sourceStatusEnglish = statuses[key(sourceStatus)];
    const translatedAction = source.originalAction ? actionTranslation(source.originalAction) : undefined;
    const reasons = [translation.reviewReason,
      !sourceStatusEnglish ? "The source status is missing or unrecognised." : undefined,
      source.originalAction && !translatedAction ? `Translate or clarify the source action: ${source.originalAction}` : undefined,
      ["Completed", "Verified"].includes(sourceStatusEnglish || "") ? "The source already reports this defect completed; review before creating repair work." : undefined,
    ].filter((value): value is string => !!value);
    const defect: CheckoutPdfDefect = {
      ...translation, sourceId: source.sourceId, inspectionId: source.inspectionId,
      originalItem: source.originalItem, originalFinding: clean(source.originalFinding),
      ...(source.originalAction ? { originalAction: clean(source.originalAction), translatedAction } : {}),
      sourceStatus, sourceStatusEnglish, reportedDate: source.reportedDate, pageNumber: source.pageNumber, y: source.y,
      needsReview: reasons.length > 0, ...(reasons.length ? { reviewReason: reasons.join(" ") } : {}),
    };
    // The upstream report can reuse a DF number in two different rooms.
    // Deduplicate only within the same room; never silently discard the other
    // room or attach its photographs to the first one.
    const roomKey = `${source.blockCode}/${canonicalRoom}`;
    const identity = `${roomKey}/${source.sourceId}`;
    const existing = ids.get(identity);
    if (existing) {
      if (existing.originalFinding !== defect.originalFinding || existing.originalItem !== defect.originalItem
        || existing.sourceStatus !== defect.sourceStatus || existing.originalAction !== defect.originalAction) {
        existing.needsReview = true;
        existing.reviewReason = `${existing.reviewReason || ""} The PDF repeats this source ID with conflicting details; verify the original report.`.trim();
        existing.conflictingDetails = [...(existing.conflictingDetails || []), {
          originalItem: defect.originalItem, originalFinding: defect.originalFinding, originalAction: defect.originalAction,
          sourceStatus: defect.sourceStatus, pageNumber: defect.pageNumber, y: defect.y,
        }];
        warnings.push(`${source.sourceId}: conflicting repeated details on page ${source.pageNumber}; only one defect retained for review.`);
      }
      return;
    }
    ids.set(identity, defect);
    const sameSource = sourceRooms.get(source.sourceId) || [];
    if (sameSource.some(entry => entry.roomKey !== roomKey)) {
      const reason = "The upstream report reuses this DF source ID in different rooms; verify each room before import.";
      for (const entry of [...sameSource, { defect, roomKey }]) {
        entry.defect.needsReview = true;
        entry.defect.reviewReason = `${entry.defect.reviewReason || ""} ${reason}`.trim();
      }
      warnings.push(`${source.sourceId}: reused in different rooms; all room findings retained separately for review.`);
    }
    sourceRooms.set(source.sourceId, [...sameSource, { defect, roomKey }]);
    let room = rooms.get(roomKey);
    if (!room) {
      room = { blockCode: source.blockCode as "A" | "B", roomNo: canonicalRoom, level: source.level, defects: [] };
      rooms.set(roomKey, room);
    } else if (room.level !== source.level) {
      defect.needsReview = true;
      defect.reviewReason = `${defect.reviewReason || ""} The PDF reports conflicting levels for this room.`.trim();
    }
    room.defects.push(defect);
  }

  for (const page of orderedPages) {
    for (let index = 0; index < page.lines.length; index++) {
      const line = page.lines[index];
      const text = clean(line.text);
      if (!text || runningLine(text)) continue;
      let heading = parseCheckoutPdfDetailHeading(text);
      // A very long item name can wrap. Join only the immediate header
      // continuation, never a finding/status line or a summary-table row.
      if (!heading && /^DF[-\u2010-\u2014]\d{4}[-\u2010-\u2014]\d+\s+[\u2013\u2014-]\s+/i.test(text)) {
        const next = clean(page.lines[index + 1]?.text || "");
        if (next && !/^(?:Penemuan|Tindakan|Status|Log kemaskini)\s*:/i.test(next)) {
          heading = parseCheckoutPdfDetailHeading(`${text} ${next}`);
          if (heading) index++;
        }
        if (!heading) {
          finish();
          warnings.push(`Unrecognised defect detail heading on page ${page.pageNumber}; check the original PDF.`);
          continue;
        }
      }
      if (heading) {
        finish();
        const roomKey = `${heading.blockCode}/${heading.roomNo.replace(/[ -]/g, "")}`;
        active = { ...heading, ...(metadata.get(`${roomKey}/${heading.sourceId}`) || metadata.get(`unscoped/${heading.sourceId}`)), pageNumber: page.pageNumber, y: line.y,
          originalFinding: "", originalAction: "", sourceStatus: "", field: null };
        continue;
      }
      if (/^(?:REKOD KEROSAKAN BILIK|Disediakan oleh|RINGKASAN MENGIKUT BILIK)/i.test(text)) {
        finish();
        continue;
      }
      if (!active) continue;
      const field = text.match(/^(Penemuan|Tindakan(?: Pembetulan)?|Status)\s*:\s*(.*)$/i);
      if (field) {
        const name = key(field[1]);
        active.field = name === "penemuan" ? "originalFinding" : name === "status" ? "sourceStatus" : "originalAction";
        active[active.field] = clean(field[2]);
        continue;
      }
      if (/^Log kemaskini\s*:/i.test(text)) {
        active.field = null;
        continue;
      }
      const inspection = text.match(/Dijana daripada pemeriksaan\s+(PM-\d{4}-\d+)/i);
      if (inspection) {
        // The generation log belongs to this exact room/detail section and is
        // stronger evidence than an unscoped table row with a reused DF number.
        active.inspectionId = canonicalId(inspection[1]);
        const date = text.match(/\[(\d{4}-\d{2}-\d{2})[ T]/);
        if (!active.reportedDate && date) active.reportedDate = date[1];
      }
      if (/^(?:Sebelum|Selepas|Tiada gambar|Disemak oleh|Disahkan oleh)/i.test(text) || /^\[\d{4}-\d{2}-\d{2}/.test(text)) continue;
      if (active.field === "originalFinding" || active.field === "originalAction") active[active.field] = clean(`${active[active.field]} ${text}`);
      else if (active.field === "sourceStatus" && /^(?:Dibaiki|Tindakan)$/i.test(text)) active.sourceStatus = clean(`${active.sourceStatus} ${text}`);
    }
  }
  finish();
  for (const room of skipped.values()) warnings.push(`Skipped ${room.blockCode} / ${room.roomNo}: ${room.reason} (${room.defectCount} source defect${room.defectCount === 1 ? "" : "s"}).`);
  if (!rooms.size) warnings.push("No detailed Block A / B defects were found. Upload the detailed UTMSPACE report, not only its summary or an image-only PDF.");
  const reviewCount = [...rooms.values()].flatMap(room => room.defects).filter(defect => defect.needsReview).length;
  if (reviewCount) warnings.push(`${reviewCount} source defect${reviewCount === 1 ? " requires" : "s require"} English translation or source review before import.`);
  return { rooms: [...rooms.values()], warnings: [...new Set(warnings)], skippedRooms: [...skipped.values()] };
}
