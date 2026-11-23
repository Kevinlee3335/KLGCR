// @vitest-environment node
import { after } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadAbInspectionGroups } from "@/lib/ab-inspection-catalog";
import { generateAbInspectionPdf } from "@/lib/ab-inspection-pdf";
import { getSessionProfile } from "@/lib/auth";
import { archiveFireSafetyInspection } from "@/lib/fire-safety-inspection-archive";
import {
  downloadAbInspectionPreviewReport,
  downloadFlexPreviewReport,
  saveAbFireSafetyInspection,
  saveFlexInspection,
} from "@/lib/flex-inspection-actions";
import { loadFlexGroups } from "@/lib/flex-inspection-catalog";
import { writeFlexInspection } from "@/lib/flex-inspection-store";
import { generateFlexInspectionPdf } from "@/lib/flex-reports/generate";
import { createClient } from "@/lib/supabase/server";
import type { FlexSaveInput } from "@/lib/flex-inspection";
import type { Profile } from "@/lib/types";

vi.mock("@/lib/auth", () => ({ getSessionProfile: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/ab-inspection-catalog", () => ({ loadAbInspectionGroups: vi.fn() }));
vi.mock("@/lib/ab-inspection-pdf", () => ({ generateAbInspectionPdf: vi.fn() }));
vi.mock("@/lib/fire-safety-inspection-archive", () => ({ archiveFireSafetyInspection: vi.fn() }));
vi.mock("@/lib/flex-inspection-catalog", () => ({ loadFlexGroups: vi.fn() }));
vi.mock("@/lib/flex-inspection-store", () => ({ writeFlexInspection: vi.fn() }));
vi.mock("@/lib/flex-reports/generate", () => ({ generateFlexInspectionPdf: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const inspector: Profile = {
  id: "00000000-0000-4000-8000-000000000001",
  full_name: "Inspection User",
  username: "inspector",
  is_active: true,
  role: "maintenance_staff",
};
const draft: FlexSaveInput = {
  period: "2024-02", inspectionDate: "2024-02-29", revision: 0, exceptions: { "unit-1": "" }, complete: false,
};
const draftRecord = {
  period: draft.period, revision: 1, exceptions: draft.exceptions,
  inspectionDate: draft.inspectionDate, inspectedByName: null, completedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSessionProfile).mockResolvedValue(inspector);
  vi.mocked(loadFlexGroups).mockResolvedValue([{
    id: "group-1", report: "exit-sign", block: "C", level: 1, location: "Lobby", quantity: 1,
    sourceCell: "B1", units: [{ id: "unit-1", label: "1" }],
  }]);
  vi.mocked(loadAbInspectionGroups).mockResolvedValue([{
    id: "ab-reel-a-1", report: "hose-reel", block: "A", level: 1, location: "Wing A", quantity: 1,
    sourceCell: "B6", units: [{ id: "ab-unit-1", label: "1" }],
  }]);
});
afterEach(() => vi.unstubAllEnvs());

it("allows a draft with a blank remark and rejects unauthorized or invalid submissions", async () => {
  vi.mocked(writeFlexInspection).mockResolvedValue(draftRecord);
  expect(await saveFlexInspection(draft)).toEqual({ ok: true, inspection: draftRecord });
  expect(await saveFlexInspection({ ...draft, complete: true })).toMatchObject({ ok: false, message: expect.stringContaining("remark") });
  expect(await saveFlexInspection({ ...draft, inspectionDate: "2026-02-29" })).toMatchObject({ ok: false, message: expect.stringContaining("valid inspection date") });
  expect(await saveFlexInspection({ ...draft, period: "9999-01" })).toMatchObject({ ok: false, message: expect.stringContaining("earlier month") });
  expect(await saveFlexInspection({ ...draft, exceptions: { another: "Broken" } })).toMatchObject({ ok: false, message: expect.stringContaining("unknown equipment") });
  vi.mocked(getSessionProfile).mockResolvedValue({ ...inspector, role: "cleaner" });
  expect(await saveFlexInspection(draft)).toMatchObject({ ok: false, message: expect.stringContaining("do not have access") });
  expect(writeFlexInspection).toHaveBeenCalledTimes(1);
  expect(createClient).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});

it("takes the acting user's signature on completion and returns a conflict for a stale save", async () => {
  const signature = { strokes: [[[0, 0], [1, 1]]] };
  const lookup = vi.fn().mockResolvedValue({ data: { signature }, error: null });
  const who = vi.fn().mockReturnValue({ maybeSingle: lookup });
  const db = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: who }) }) };
  vi.mocked(createClient).mockResolvedValue(db as unknown as Awaited<ReturnType<typeof createClient>>);
  vi.mocked(writeFlexInspection).mockResolvedValue(null);

  const input = { ...draft, revision: 1, exceptions: { "unit-1": "  Broken  " }, complete: true };
  expect(await saveFlexInspection(input)).toMatchObject({ ok: false, code: "conflict" });
  expect(after).not.toHaveBeenCalled();
  expect(who).toHaveBeenCalledWith("user_id", inspector.id);
  expect(writeFlexInspection).toHaveBeenCalledWith(
    { ...input, exceptions: { "unit-1": "Broken" } }, inspector, signature, "cd",
  );

  lookup.mockResolvedValue({ data: { signature: { strokes: [] } }, error: null });
  const completed = { ...draftRecord, inspectedByName: inspector.full_name, completedAt: "2024-02-29T10:00:00Z" };
  vi.mocked(writeFlexInspection).mockResolvedValue(completed);
  expect(await saveFlexInspection(input)).toEqual({ ok: true, inspection: completed });
  expect(writeFlexInspection).toHaveBeenLastCalledWith(
    { ...input, exceptions: { "unit-1": "Broken" } }, inspector, null, "cd",
  );
});

it("generates trial reports from trial data without writing an inspection or reading a saved signature", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.mocked(generateFlexInspectionPdf).mockResolvedValue(Buffer.from("%PDF-1.7"));
  const complete = { ...draft, complete: true, exceptions: { "unit-1": "Trial fault" } };
  expect(await saveFlexInspection(complete)).toMatchObject({
    ok: true, inspection: { inspectedByName: "Trial Inspector", exceptions: complete.exceptions },
  });
  expect(await downloadFlexPreviewReport("exit-sign", complete)).toEqual({
    ok: true, content: Buffer.from("%PDF-1.7").toString("base64"),
  });
  expect(generateFlexInspectionPdf).toHaveBeenCalledWith("exit-sign", expect.objectContaining({
    period: draft.period, inspectedByName: "Trial Inspector",
  }));
  expect(writeFlexInspection).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});

it("validates Block A and B saves against their own inventory and writes to their own inspection scope", async () => {
  const input = { ...draft, exceptions: { "ab-unit-1": "Blocked" } };
  const inspection = { ...draftRecord, exceptions: input.exceptions };
  vi.mocked(writeFlexInspection).mockResolvedValue(inspection);
  expect(await saveAbFireSafetyInspection(draft)).toMatchObject({
    ok: false, message: expect.stringContaining("unknown equipment"),
  });
  expect(await saveAbFireSafetyInspection(input)).toEqual({ ok: true, inspection });
  expect(writeFlexInspection).toHaveBeenCalledExactlyOnceWith(input, inspector, null, "ab");
  expect(loadFlexGroups).not.toHaveBeenCalled();

  vi.mocked(getSessionProfile).mockResolvedValue({ ...inspector, role: "cleaner" });
  expect(await saveAbFireSafetyInspection(input)).toMatchObject({
    ok: false, message: expect.stringContaining("do not have access"),
  });
  expect(writeFlexInspection).toHaveBeenCalledTimes(1);
  expect(after).not.toHaveBeenCalled();
});

it("allows only authenticated Block A and B preview reports and makes no live writes", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  const input = { ...draft, complete: true, exceptions: { "ab-unit-1": "Blocked" } };
  expect(await downloadAbInspectionPreviewReport("hose-reel", input)).toMatchObject({ ok: false });
  expect(getSessionProfile).not.toHaveBeenCalled();

  vi.stubEnv("VERCEL_ENV", "preview");
  vi.mocked(getSessionProfile).mockResolvedValueOnce(null);
  expect(await downloadAbInspectionPreviewReport("hose-reel", input)).toMatchObject({ ok: false });
  expect(generateAbInspectionPdf).not.toHaveBeenCalled();

  vi.mocked(generateAbInspectionPdf).mockResolvedValue(Buffer.from("%PDF-1.7"));
  expect(await downloadAbInspectionPreviewReport("hose-reel", input)).toEqual({
    ok: true, content: Buffer.from("%PDF-1.7").toString("base64"),
  });
  expect(generateAbInspectionPdf).toHaveBeenCalledWith("hose-reel", expect.objectContaining({
    period: draft.period, inspectedByName: "Trial Inspector", exceptions: input.exceptions,
  }));
  expect(generateFlexInspectionPdf).not.toHaveBeenCalled();
  expect(writeFlexInspection).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});

it.each([
  ["ab", saveAbFireSafetyInspection],
  ["cd", saveFlexInspection],
] as const)("archives a completed %s inspection after the successful save", async (scope, save) => {
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  };
  vi.mocked(createClient).mockResolvedValue(db as unknown as Awaited<ReturnType<typeof createClient>>);
  const input = { ...draft, complete: true, exceptions: {} };
  const inspection = {
    ...draftRecord, exceptions: {}, inspectedByName: inspector.full_name, completedAt: "2024-02-29T10:00:00Z",
  };
  vi.mocked(writeFlexInspection).mockResolvedValue(inspection);

  expect(await save(input)).toEqual({ ok: true, inspection });
  expect(after).toHaveBeenCalledOnce();
  expect(archiveFireSafetyInspection).not.toHaveBeenCalled();
  const callback = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
  await callback();
  expect(archiveFireSafetyInspection).toHaveBeenCalledExactlyOnceWith(scope, input.period);

  vi.mocked(archiveFireSafetyInspection).mockRejectedValueOnce(new Error("Temporary storage failure"));
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(callback()).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("could not be archived"), { scope, period: input.period });

    vi.mocked(after).mockImplementationOnce(() => { throw new Error("Queue unavailable"); });
    expect(await save(input)).toEqual({ ok: true, inspection });
  } finally {
    errorLog.mockRestore();
  }
});
