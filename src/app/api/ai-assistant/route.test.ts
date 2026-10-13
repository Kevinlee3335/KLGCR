import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), snapshot: vi.fn(), rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionProfile: mocks.profile }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/ai-assistant-data", () => ({ readAiSnapshot: mocks.snapshot }));
import { GET, POST } from "./route";
function request(body: unknown = { question: "What needs attention?" }, origin = "https://test.example") { return new NextRequest("https://test.example/api/ai-assistant", { method: "POST", headers: { "origin": origin, "content-type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/ai-assistant-v1"); vi.stubEnv("GEMINI_API_KEY", "test-key");
  mocks.profile.mockResolvedValue({ id: "admin-id", role: "admin" }); mocks.snapshot.mockResolvedValue({ capturedAt: "2026-10-13T00:00:00Z", sources: [{ table: "complaints", loaded: 1, records: [{ complaint_no: "CMP-1" }] }] });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "klgcr_ai_reserve" ? { id: "req-1", reservedMyr: .5, budgetMyr: 20 } : { reservedMyr: .5 }, error: null }));
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "CMP-1 needs review." }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 } }) }); vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("AI endpoint", () => {
  it("does not expose production API", async () => { vi.stubEnv("VERCEL_ENV", "production"); expect((await POST(request())).status).toBe(404); expect(mocks.profile).not.toHaveBeenCalled(); });
  it.each(["cleaner", "maintenance_staff"])("denies %s before reading data or billing", async role => { mocks.profile.mockResolvedValue({ role }); expect((await POST(request())).status).toBe(403); expect(mocks.snapshot).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); });
  it("requires login", async () => { mocks.profile.mockResolvedValue(null); expect((await GET()).status).toBe(401); });
  it("rejects cross-origin and malformed payloads", async () => { expect((await POST(request({}, "https://evil.example"))).status).toBe(403); expect((await POST(request({ question: " " }))).status).toBe(400); expect(mocks.snapshot).not.toHaveBeenCalled(); });
  it.each(["admin", "management_viewer"])("supports %s with current data and bounded history", async role => {
    mocks.profile.mockResolvedValue({ id: "user-id", role });
    const response = await POST(request({ question: "Follow up", history: [{ role: "user", text: "Earlier question" }, { role: "assistant", text: "Earlier answer" }] }));
    expect(response.status).toBe(200); const data = await response.json(); expect(data.answer).toContain("CMP-1"); expect(data.sources[0].records).toBeUndefined();
    const args = mocks.fetch.mock.calls[0]; expect(args[1].headers["x-goog-api-key"]).toBe("test-key"); const sent = JSON.parse(args[1].body); expect(sent.contents[1].role).toBe("model"); expect(sent.contents[2].parts[0].text).toContain("CMP-1"); expect(sent.tools).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("klgcr_ai_finish", expect.objectContaining({ p_total: 120, p_state: "completed" }));
  });
  it("pauses when durable budget is exhausted", async () => { mocks.rpc.mockResolvedValue({ error: { message: "RM20 budget reached" } }); expect((await POST(request())).status).toBe(429); expect(mocks.fetch).not.toHaveBeenCalled(); });
  it("fails closed if data/ledger cannot be read", async () => { mocks.snapshot.mockRejectedValue(new Error("Unable to read inventory_items. No analysis was sent.")); expect((await POST(request())).status).toBe(503); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); });
  it("keeps reservation and records failure on Gemini timeout", async () => { mocks.fetch.mockRejectedValue(new Error("timeout")); expect((await POST(request())).status).toBe(502); expect(mocks.rpc).toHaveBeenCalledWith("klgcr_ai_finish", expect.objectContaining({ p_state: "failed" })); });
  it("returns a safe actionable invalid-key error without exposing provider messages", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { status: "INVALID_ARGUMENT", message: "secret provider text", details: [{ reason: "API_KEY_INVALID" }] } }) });
    const result = await POST(request()); expect(result.status).toBe(502);
    const data = await result.json(); expect(data.providerReason).toBe("API_KEY_INVALID"); expect(data.error).toContain("API key is invalid"); expect(JSON.stringify(data)).not.toContain("secret provider text");
    expect(mocks.rpc).toHaveBeenCalledWith("klgcr_ai_finish", expect.objectContaining({ p_state: "provider_400_INVALID_ARGUMENT_API_KEY_INVALID" }));
  });
  it("rejects oversized database context before billing", async () => { mocks.snapshot.mockResolvedValue({ sources: [{ table: "a".repeat(80001), records: [] }] }); expect((await POST(request())).status).toBe(413); expect(mocks.rpc).not.toHaveBeenCalled(); });
});
