// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), preview: vi.fn(), archive: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionProfile: mocks.profile }));
vi.mock("@/lib/flex-inspection-review-store", () => ({ isFlexPreview: mocks.preview }));
vi.mock("@/lib/fire-safety-inspection-archive", () => ({ getArchivedFireSafetyInspectionUrl: mocks.archive }));

function openReport(scope = "ab", period = "2026-11") {
  const request = new Request(`https://example.org/api/fire-safety-inspection-archive/${scope}/${period}?download=1`);
  return GET(request, { params: Promise.resolve({ scope, period }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preview.mockReturnValue(false);
  mocks.profile.mockResolvedValue({ role: "management_viewer" });
  mocks.archive.mockResolvedValue("https://example.org/signed-report.pdf");
});

it("keeps trial requests, forged scopes and unauthorized roles away from private PDFs", async () => {
  mocks.preview.mockReturnValueOnce(true);
  expect((await openReport()).status).toBe(404);
  expect((await openReport("constructor")).status).toBe(404);
  expect((await openReport("ab", "not-a-month")).status).toBe(404);
  expect(mocks.profile).not.toHaveBeenCalled();
  mocks.profile.mockResolvedValueOnce({ role: "cleaner" });
  expect((await openReport()).status).toBe(403);
  expect(mocks.archive).not.toHaveBeenCalled();
});

it("redirects an authorized download to the fresh private signed URL", async () => {
  const response = await openReport("cd");
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://example.org/signed-report.pdf");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.archive).toHaveBeenCalledWith("cd", "2026-11", true);
});
