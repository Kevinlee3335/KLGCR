import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ error: false, columns: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => {
  const chain = { select: (columns: string) => { state.columns.push(columns); return chain; }, order: () => chain, eq: () => chain, limit: () => chain, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: state.error ? { message: "denied" } : null, count: 2, data: table === "complaints" ? [{ complaint_no: "CMP-X", room_no: "421", block: { code: "A" }, status: "new" }] : [] })) };
  return chain;
} }) }));
import { readAiSnapshot } from "./ai-assistant-data";
beforeEach(() => { state.error = false; state.columns = []; });
it("only selects explicit safe fields and declares partial coverage", async () => {
  const snapshot = await readAiSnapshot("a421"); expect(snapshot.sources).toHaveLength(5); expect(snapshot.sources[0].records[0].complaint_no).toBe("CMP-X"); expect(snapshot.sources[0].truncated).toBe(true);
  expect(state.columns.join(",")).not.toMatch(/complainant|reporter|phone|email|contact|photo|notes|\*/);
});
it("does not substitute empty data for a failed source", async () => { state.error = true; await expect(readAiSnapshot("summary")).rejects.toThrow("Unable to read"); });
