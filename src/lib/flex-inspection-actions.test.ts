// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { getSessionProfile } from "@/lib/auth";
import { saveFlexInspection } from "@/lib/flex-inspection-actions";
import { loadFlexGroups } from "@/lib/flex-inspection-catalog";
import { writeFlexInspection } from "@/lib/flex-inspection-store";
import { createClient } from "@/lib/supabase/server";
import type { FlexSaveInput } from "@/lib/flex-inspection";
import type { Profile } from "@/lib/types";

vi.mock("@/lib/auth", () => ({ getSessionProfile: vi.fn() }));
vi.mock("@/lib/flex-inspection-catalog", () => ({ loadFlexGroups: vi.fn() }));
vi.mock("@/lib/flex-inspection-store", () => ({ writeFlexInspection: vi.fn() }));
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
});

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
  expect(who).toHaveBeenCalledWith("user_id", inspector.id);
  expect(writeFlexInspection).toHaveBeenCalledWith(
    { ...input, exceptions: { "unit-1": "Broken" } }, inspector, signature,
  );

  lookup.mockResolvedValue({ data: { signature: { strokes: [] } }, error: null });
  const completed = { ...draftRecord, inspectedByName: inspector.full_name, completedAt: "2024-02-29T10:00:00Z" };
  vi.mocked(writeFlexInspection).mockResolvedValue(completed);
  expect(await saveFlexInspection(input)).toEqual({ ok: true, inspection: completed });
  expect(writeFlexInspection).toHaveBeenLastCalledWith(
    { ...input, exceptions: { "unit-1": "Broken" } }, inspector, null,
  );
});
