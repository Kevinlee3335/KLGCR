import { afterEach, describe, expect, it, vi } from "vitest";
import { previewEnabled, requestSchema, summarize } from "./ai-assistant";
afterEach(() => vi.unstubAllEnvs());
describe("AI request boundaries", () => {
  it("rejects blank/oversized messages and extra query instructions", () => {
    for (const value of [{ question: " " }, { question: "a".repeat(1501) }, { question: "hello", sql: "delete" }, { question: "hello", history: Array(9).fill({ role: "user", text: "x" }) }]) expect(requestSchema.safeParse(value).success).toBe(false);
    expect(requestSchema.parse({ question: " hello " }).question).toBe("hello");
  });
  it("fails closed outside the exact preview branch", () => {
    vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/ai-assistant-v1"); expect(previewEnabled()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview"); expect(previewEnabled()).toBe(true);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main"); expect(previewEnabled()).toBe(false);
  });
  it("counts statuses without presenting absent statuses as records", () => {
    expect(summarize([{ status: "assigned" }, { status: "completed" }, { status: "assigned" }])).toEqual({ loaded: 3, statuses: { assigned: 2, completed: 1 }, workload: {} });
  });
});

it("counts dates in Malaysia and includes complaint rows beyond the detail cap", async () => {
  const { complaintDateSummary } = await import("./ai-assistant");
  const rows = Array.from({ length: 81 }, () => ({ category: "ELECTRICAL", status: "closed", submitted_at: "2026-09-30T16:30:00Z" }));
  expect(complaintDateSummary(rows).byDayCategory).toEqual([{ date: "2026-10-01", category: "ELECTRICAL", count: 81 }]);
});
it("sums issued quantities by date/item/unit without mixing quantities or balances", async () => {
  const { materialUsageSummary } = await import("./ai-assistant");
  const row = { issued_at: "2026-10-01T01:00:00Z", item: { item_code: "P00003", description: "Pipe", unit: "pcs" }, balance_after: 99 };
  expect(materialUsageSummary([{ ...row, qty: "2.5" }, { ...row, qty: 1 }]).byDayItem[0]).toMatchObject({ quantityIssued: 3.5, issueCount: 2, unit: "pcs" });
});
it("computes monthly material totals/counts across days, excludes other months and ranks quantities per unit", async () => {
  const { materialUsageSummary } = await import("./ai-assistant");
  const rows = Array.from({ length: 13 }, (_, index) => ({ issued_at: `2026-10-${String(index+1).padStart(2,"0")}T01:00:00Z`, qty: 1, item: { item_code: "LED", unit: "pcs" } }));
  rows.push({ issued_at: "2026-09-30T01:00:00Z", qty: 99, item: { item_code: "LED", unit: "pcs" } });
  rows.push({ issued_at: "2026-10-03T01:00:00Z", qty: 20, item: { item_code: "PAINT", unit: "litre" } });
  const result = materialUsageSummary(rows, new Date("2026-10-13T07:51:41Z"));
  expect(result.currentMonth.items.find(item => item.itemCode === "LED")).toMatchObject({ quantityIssued: 13, issueCount: 13 });
  expect(result.currentMonth.mostFrequentlyIssued?.itemCode).toBe("LED");
  expect(result.currentMonth.rankingsByUnit).toHaveLength(2);
  expect(result.currentMonth.rankingsByUnit.every(group => group.items.every(item => item.unit === group.unit))).toBe(true);
});
