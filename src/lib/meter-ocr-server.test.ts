import { afterEach, expect, it, vi } from "vitest";
import { readMeterPhoto } from "./meter-ocr-server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("waits for two OCR reservation windows without calling the provider twice", async () => {
  vi.useFakeTimers();
  vi.stubEnv("GEMINI_API_KEY", "fixture-key");
  const throttled = { data: null, error: { message: "Please wait 10 seconds" } };
  mocks.rpc
    .mockResolvedValueOnce(throttled)
    .mockResolvedValueOnce(throttled)
    .mockResolvedValueOnce({ data: { id: "reservation" }, error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  const provider = vi.fn(async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ integerDigits: "150", decimalDigits: null, confidence: "high", note: "" }) }] } }],
  }));
  vi.stubGlobal("fetch", provider);

  const reading = readMeterPhoto({ photo: "data:image/jpeg;base64,YQ==", unit: "kWh", serial: "E1" }, "user", {
    reservationRetries: 2,
  });
  await vi.advanceTimersByTimeAsync(19_999);
  expect(provider).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);
  expect(await reading).toMatchObject({ reading: 150, confidence: "high" });
  expect(provider).toHaveBeenCalledOnce();
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
    "klgcr_ai_reserve", "klgcr_ai_reserve", "klgcr_ai_reserve", "klgcr_ai_finish",
  ]);
});
