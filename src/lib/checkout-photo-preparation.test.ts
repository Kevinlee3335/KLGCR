import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareAdminInspectionEvidence } from "@/app/(dashboard)/admin/checkouts/actions";
import { prepareInspectionPhotos } from "@/app/(dashboard)/admin/checkouts/inspection/actions";
import { prepareCheckoutEvidence } from "@/app/(dashboard)/staff/checkouts/actions";

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  inspector: vi.fn(),
  room: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.role,
  requireCheckoutInspector: mocks.inspector,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      maybeSingle: mocks.room,
    };
    return {
      from: () => query,
      storage: { from: () => ({ createSignedUploadUrl: mocks.sign }) },
    };
  },
}));

const id = "11111111-1111-4111-8111-111111111111";
const files = ["jpeg", "png", "webp", "jpeg", "png", "webp", "jpeg"].map(extension => ({
  type: "image/" + extension,
  size: 10,
}));

describe("check-out photo upload preparation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.role.mockImplementation(async ([role]: string[]) => ({ id: "staff", role }));
    mocks.inspector.mockResolvedValue({ id: "inspector" });
    mocks.room.mockResolvedValue({ data: { id }, error: null });
    mocks.sign.mockImplementation(async (path: string) => ({ data: { token: path }, error: null }));
  });

  it.each([
    ["admin room inspection", prepareAdminInspectionEvidence, id + "/inspection/"],
    ["staff rectification", (room: string, photos: typeof files) => prepareCheckoutEvidence(room, "completion", photos), id + "/completion/"],
    ["Block A/B inspection", prepareInspectionPhotos, "inspector/inspection/" + id + "/"],
  ] as const)("signs %s in parallel without reordering photo paths", async (_label, prepare, prefix) => {
    let finishFirst!: () => void;
    let inFlight = 0;
    let peak = 0;
    mocks.sign.mockImplementation((path: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      if (mocks.sign.mock.calls.length === 1) {
        return new Promise(resolve => { finishFirst = () => {
          inFlight--;
          resolve({ data: { token: path }, error: null });
        }; });
      }
      return Promise.resolve().then(() => {
        inFlight--;
        return { data: { token: path }, error: null };
      });
    });

    const prepared = prepare(id, files);
    await vi.waitFor(() => expect(mocks.sign).toHaveBeenCalledTimes(files.length));
    expect(peak).toBe(4);
    finishFirst();

    const result = await prepared;
    expect("uploads" in result && result.uploads.map(upload => upload.path.split(".").pop()))
      .toEqual(["jpg", "png", "webp", "jpg", "png", "webp", "jpg"]);
    expect("uploads" in result && result.uploads.every(upload => upload.path.startsWith(prefix) && upload.token === upload.path))
      .toBe(true);
  });

  it("returns a preparation error and withholds partial upload links", async () => {
    mocks.sign.mockResolvedValueOnce({ data: null, error: { message: "Storage unavailable" } });
    await expect(prepareAdminInspectionEvidence(id, files)).resolves.toEqual({ error: "Storage unavailable" });
    expect(mocks.sign).toHaveBeenCalledTimes(4);
  });

  it("does not sign photos for an unassigned room, an invalid stage, or more than 20 photos", async () => {
    mocks.room.mockResolvedValue({ data: null, error: null });
    expect(await prepareCheckoutEvidence(id, "completion", files)).toHaveProperty("error");
    expect(await prepareAdminInspectionEvidence(id, files)).toHaveProperty("error");
    expect(await prepareInspectionPhotos(id, Array(21).fill(files[0]))).toHaveProperty("error");
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
