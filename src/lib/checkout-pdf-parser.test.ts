import { describe, expect, it } from "vitest";
import { parseCheckoutPdfDetailHeading, parseCheckoutPdfPages, translateCheckoutPdfFinding, type CheckoutPdfPage } from "./checkout-pdf-parser";

function page(pageNumber: number, texts: string[]): CheckoutPdfPage {
  return { pageNumber, width: 595, height: 842, lines: texts.map((text, index) => ({ text, x: 24, y: 800 - index * 18 })) };
}
function detail(id: string, room: string, item: string, finding: string, rest: string[] = []) {
  return [`${id} — Blok ${room[0]} / Aras ${room[1]} / ${room} — ${item}`, `Penemuan: ${finding}`, ...rest, "Status: Baru", "Log kemaskini:"];
}

describe("UTMSPACE detail-report parsing", () => {
  it("ignores summary tables, preserves all first-five-room source defects and links their coordinates", () => {
    const sections: [string, string, string, string, string?][] = [
      ["0071", "A103", "Kebersihan Lantai", "Kotor"],
      ["0072", "A103", "Kebersihan Dinding", "Cat terkopek Dinding kulat"],
      ["0073", "A103", "Bau Pengudaraan", "Bilik berbau"],
      ["0074", "A103", "Tandas", "Kotor"],
      ["0075", "A103", "Shower", "Bocor"],
      ["0076", "A103", "Almari", "Kulat"],
      ["0791", "A104", "Kebersihan Lantai", "Kotor"],
      ["0792", "A104", "Kebersihan Dinding", "Kotor kulat"],
      ["0793", "A104", "Tandas", "Kotor"],
      ["0794", "A104", "Sinki", "Loose"],
      ["0059", "A107", "Kebersihan Dinding", "Kulat"],
      ["0060", "A107", "Kebersihan Siling", "Kulat"],
      ["0061", "A107", "Bau Pengudaraan", "Bilik berbau"],
      ["0062", "A107", "Kipas", "Kotor"],
      ["0063", "A107", "Pintu", "Kulat"],
      ["0064", "A107", "Tandas", "Kotor"],
      ["0065", "A107", "Paip Air", "Hose tidak dalam keadaan sepatutnya"],
      ["0066", "A107", "Meja", "Kotor"],
      ["0069", "A107", "Inventori: Almari pakaian", "Almari pakaian: dijangka 2, ada 1 (kurang 1)", "Ganti / bekalkan 1 unit"],
      ["0321", "A207", "Kebersihan Dinding", "Terkopek", "Cat masih terkopek"],
      ["0285", "A208", "Inventori: Almari pakaian", "Almari pakaian: dijangka 2, ada 0 (kurang 2)", "Ganti / bekalkan 2 unit"],
    ];
    const pages = [page(1, ["RINGKASAN MENGIKUT BILIK", "1 Blok A 1 A103 6 6", "2 Blok A 1 A104 4 4"])];
    for (const [index, [id, room, item, finding, action]] of sections.entries()) {
      pages.push(page(index + 4, [
        `1 DF-2026-${id} 04/11/2026 ${item} Tinggi K-Hotel 09/11/2026 - Baru`,
        "PM-2026-0033 finding text in the summary",
        "BUTIRAN & BUKTI PEMBAIKAN",
        ...detail(`DF-2026-${id}`, room, item, finding, action ? [`Tindakan: ${action}`] : []),
      ]));
    }
    const result = parseCheckoutPdfPages(pages);
    expect(result.rooms.map(room => room.roomNo)).toEqual(["A103", "A104", "A107", "A207", "A208"]);
    expect(result.rooms.map(room => room.defects.length)).toEqual([6, 4, 9, 1, 1]);
    expect(result.rooms.flatMap(room => room.defects)).toHaveLength(21);
    expect(result.rooms.flatMap(room => room.defects).every(defect => !defect.needsReview)).toBe(true);
    expect(result.rooms[0].defects[0]).toMatchObject({
      sourceId: "DF-2026-0071", inspectionId: "PM-2026-0033", reportedDate: "2026-11-04",
      pageNumber: 4, y: 746, originalItem: "Kebersihan Lantai", originalFinding: "Kotor", title: "Floor dirty A103",
    });
    expect(result.rooms[0].defects[1].title).toBe("Wall moldy and paint peeling A103");
    expect(result.rooms[2].defects[6].description).toBe("Water hose not in proper condition");
    expect(result.rooms[2].defects[8]).toMatchObject({ missingQuantity: 1, expectedQuantity: 2, presentQuantity: 1, title: "Wardrobe missing 1 A107", translatedAction: "Replace / supply 1 unit" });
    expect(result.rooms[4].defects[0]).toMatchObject({ missingQuantity: 2, presentQuantity: 0, title: "Wardrobe missing 2 A208" });
    expect(result.warnings).toEqual([]);
  });

  it("does not create defects when a PDF contains only the summary or empty scans", () => {
    const result = parseCheckoutPdfPages([page(1, ["11/27/26, 5:29 PM Sistem Pemeriksaan Bilik", "1 DF-2026-0001 04/11/2026 Kebersihan Lantai", "PM-2026-0010 Kotor", "Blok A 1 A103 6 6"])]);
    expect(result.rooms).toEqual([]);
    expect(result.warnings.join(" ")).toContain("No detailed Block A / B defects");
    expect(parseCheckoutPdfPages([]).rooms).toEqual([]);
  });

  it("keeps multiline findings across page breaks while excluding running headers, photo captions and footer links", () => {
    const result = parseCheckoutPdfPages([
      page(5, ["DF-2026-0001 — Blok B / Aras 1 / B102 — Kebersihan Dinding", "Penemuan: Cat terkopek", "https://script.google.com/report 5/165"]),
      page(6, ["11/27/26, 5:29 PM Sistem Pemeriksaan Bilik", "Dinding kulat", "Status: Belum", "Dibaiki", "Sebelum", "Selepas", "Tiada gambar", "Log kemaskini:", "[2026-11-04 12:12] Dijana daripada pemeriksaan PM-2026-0001 oleh Inspector", "[2026-11-19 23:50] Status: Baru → Dalam Tindakan"]),
    ]);
    expect(result.rooms[0].defects[0]).toMatchObject({ originalFinding: "Cat terkopek Dinding kulat", sourceStatus: "Belum Dibaiki", sourceStatusEnglish: "Not repaired", reportedDate: "2026-11-04", inspectionId: "PM-2026-0001", pageNumber: 5, y: 800, needsReview: false });
  });

  it("uses the reported date instead of print, target, completion and status-log dates", () => {
    const result = parseCheckoutPdfPages([page(2, [
      "11/27/26, 5:29 PM Sistem Pemeriksaan Bilik",
      "1 DF-2026-0030 04/11/2026 Tandas Tinggi 09/11/2026 19/11/2026 Belum Dibaiki",
      "PM-2026-0085 Kotor",
      ...detail("DF-2026-0030", "A207", "Tandas", "Kotor"),
      "[2026-11-04 21:04] Dijana daripada pemeriksaan PM-2026-0085 oleh Inspector",
      "[2026-11-19 23:50] Disemak semula: kerosakan BELUM dibaiki",
    ])]);
    expect(result.rooms[0].defects[0].reportedDate).toBe("2026-11-04");
    expect(result.rooms[0].defects[0].sourceStatus).toBe("Baru");
  });

  it("deduplicates repeated detail sections by source ID and flags conflicting repeats", () => {
    const lines = detail("DF-2026-0001", "A103", "Kebersihan Lantai", "Kotor");
    const same = parseCheckoutPdfPages([page(1, lines), page(2, lines)]);
    expect(same.rooms[0].defects).toHaveLength(1);
    expect(same.warnings).toEqual([]);
    const conflict = parseCheckoutPdfPages([page(1, lines), page(2, detail("DF-2026-0001", "A103", "Kipas", "Kotor"))]);
    expect(conflict.rooms).toHaveLength(1);
    expect(conflict.rooms[0].defects[0].needsReview).toBe(true);
    expect(conflict.rooms[0].defects[0].conflictingDetails?.[0]).toMatchObject({ originalItem: "Kipas", originalFinding: "Kotor", pageNumber: 2 });
    expect(conflict.warnings.join(" ")).toContain("conflicting repeated details");
  });

  it("retains both rooms when the upstream report reuses a DF source ID, and requires review of each", () => {
    const result = parseCheckoutPdfPages([page(1, detail("DF-2026-0001", "B116", "Kipas", "Kotor")), page(2, detail("DF-2026-0001", "B117", "Kipas", "Kotor"))]);
    expect(result.rooms.map(room => room.roomNo)).toEqual(["B116", "B117"]);
    expect(result.rooms.flatMap(room => room.defects)).toHaveLength(2);
    expect(result.rooms.every(room => room.defects[0].needsReview)).toBe(true);
    expect(result.warnings.join(" ")).toContain("all room findings retained separately");
  });

  it("scopes summary dates and PM references to the room when source IDs are reused", () => {
    const result = parseCheckoutPdfPages([
      page(1, ["Bilik B116 Blok / Aras Blok B / Aras 1", "1 DF-2026-0001 04/11/2026 Kipas 09/11/2026", "PM-2026-0100 Kotor", ...detail("DF-2026-0001", "B116", "Kipas", "Kotor")]),
      page(2, ["Bilik B117 Blok / Aras Blok B / Aras 1", "1 DF-2026-0001 16/11/2026 Kipas 19/11/2026", "PM-2026-0200 Kotor", ...detail("DF-2026-0001", "B117", "Kipas", "Kotor")]),
    ]);
    expect(result.rooms[0].defects[0]).toMatchObject({ reportedDate: "2026-11-04", inspectionId: "PM-2026-0100" });
    expect(result.rooms[1].defects[0]).toMatchObject({ reportedDate: "2026-11-16", inspectionId: "PM-2026-0200" });
  });

  it("skips non-AB rooms explicitly without interpreting their numbers as an AB bedroom", () => {
    const result = parseCheckoutPdfPages([page(1, [
      ...detail("DF-2026-0001", "A103", "Kipas", "Kotor"),
      "DF-2026-0002 — T06 / Aras 1 / BK 01-01 — Aircond berfungsi", "Penemuan: 1 unit tidak berfungsi", "Status: Baru",
      "DF-2026-0003 — Blok A / Aras 1 / B103 — Kipas", "Penemuan: Kotor", "Status: Baru",
    ])]);
    expect(result.rooms.map(room => room.roomNo)).toEqual(["A103"]);
    expect(result.skippedRooms).toMatchObject([{ blockCode: "T06", roomNo: "BK 01-01", defectCount: 1 }, { blockCode: "A", roomNo: "B103", defectCount: 1 }]);
    expect(result.warnings.join(" ")).toContain("Outside Block A / B import scope");
    expect(result.warnings.join(" ")).toContain("does not match");
  });

  it("requires review for unknown terms, absent findings, unknown status and completed source work", () => {
    const missing = detail("DF-2026-0001", "A103", "Kipas", "Kotor").filter(line => !line.startsWith("Penemuan:"));
    const result = parseCheckoutPdfPages([page(1, [
      ...missing,
      ...detail("DF-2026-0002", "A103", "Kipas", "Masalah perlu disiasat"),
      "DF-2026-0003 — Blok A / Aras 1 / A103 — Kipas", "Penemuan: Kotor", "Status: Selesai", "Log kemaskini:",
      "DF-2026-0004 — Blok A / Aras 1 / A103 — Kipas", "Penemuan: Kotor", "Status: Semak", "Log kemaskini:",
    ])]);
    expect(result.rooms[0].defects.every(defect => defect.needsReview)).toBe(true);
    expect(result.rooms[0].defects[0].description).toBe("");
    expect(result.rooms[0].defects[1].originalFinding).toBe("Masalah perlu disiasat");
    expect(result.rooms[0].defects[2].reviewReason).toContain("already reports this defect completed");
    expect(result.warnings.join(" ")).toContain("4 source defects require");
  });

  it("retains an unknown corrective action and requests review instead of inventing an instruction", () => {
    const result = parseCheckoutPdfPages([page(1, detail("DF-2026-0001", "A103", "Kipas", "Kotor", ["Tindakan: Sila rujuk pegawai teknikal"]))]);
    expect(result.rooms[0].defects[0]).toMatchObject({ description: "Fan dirty", originalAction: "Sila rujuk pegawai teknikal", needsReview: true });
    expect(result.rooms[0].defects[0].translatedAction).toBeUndefined();
  });
});

describe("conservative Malay finding translation", () => {
  it("retains compound findings and does not replace the generic source item with a different fixture", () => {
    expect(translateCheckoutPdfFinding("Tandas", "Kotor Dan Kulat", "A210").description).toBe("Toilet dirty and moldy");
    expect(translateCheckoutPdfFinding("Shower", "Bocor", "A103").description).toBe("Shower leaking");
    expect(translateCheckoutPdfFinding("Kebersihan Siling", "kulat dan ada air", "A103").description).toBe("Ceiling moldy with water present");
    expect(translateCheckoutPdfFinding("Paip Air", "Hose tidak dalam keadaan sepatutnya", "A107").description).toBe("Water hose not in proper condition");
  });

  it("requires review for contradictory quantities and uncertain inventory remarks", () => {
    const conflict = translateCheckoutPdfFinding("Inventori: Almari pakaian", "Almari pakaian: dijangka 2, ada 1 (kurang 2)", "A107");
    expect(conflict.needsReview).toBe(true);
    expect(conflict.description).toBe("");
    const uncertain = translateCheckoutPdfFinding("Inventori: Kerusi", "Kerusi: dijangka 2, ada 1 (kurang 1) — Tak pasti", "A107");
    expect(uncertain).toMatchObject({ missingQuantity: 1, needsReview: true });
    expect(uncertain.reviewReason).toContain("Tak pasti");
  });

  it("preserves unknown original wording for review rather than dropping extra qualifiers", () => {
    expect(translateCheckoutPdfFinding("Kipas", "Kotor tetapi bunyi pelik", "A107")).toMatchObject({ description: "", needsReview: true });
    expect(translateCheckoutPdfFinding("Alat lain", "Kotor", "A107")).toMatchObject({ description: "", needsReview: true });
  });

  it("recognises only detailed location headers, including T06 identifiers for explicit skipping", () => {
    expect(parseCheckoutPdfDetailHeading("1 DF-2026-0001 04/11/2026 Kipas Kotor")).toBeNull();
    expect(parseCheckoutPdfDetailHeading("DF-2026-0001 — Blok A / Aras 1 / A103 — Kipas")).toMatchObject({ sourceId: "DF-2026-0001", blockCode: "A", roomNo: "A103", originalItem: "Kipas" });
    expect(parseCheckoutPdfDetailHeading("DF-2026-0002 — T06 / Aras 1 / BK 01-01 — Aircond berfungsi")).toMatchObject({ blockCode: "T06", roomNo: "BK 01-01" });
  });
});
