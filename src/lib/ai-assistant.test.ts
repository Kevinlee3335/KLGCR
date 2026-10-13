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
