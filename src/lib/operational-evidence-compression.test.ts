import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareOperationalEvidencePhotos } from "./operational-evidence-compression";

const bitmap = (width = 3024, height = 4032) => ({ width, height, close: vi.fn() });
const photo = (name = "camera.jpg", size = 2_000_000, type = "image/jpeg") =>
  new File([new Uint8Array(size)], name, { type, lastModified: 123 });
const drawImage = vi.fn();
const decode = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  decode.mockReset().mockResolvedValue(bitmap());
  vi.stubGlobal("createImageBitmap", decode);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((done) => done(new Blob([new Uint8Array(300_000)], { type: "image/jpeg" })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("reduces a large camera JPEG using the EXIF-oriented dimensions and preserves selection metadata", async () => {
  const original = photo();
  const oriented = bitmap();
  decode.mockResolvedValueOnce(oriented);

  const [prepared] = await prepareOperationalEvidencePhotos([original]);

  expect(decode).toHaveBeenCalledWith(original, { imageOrientation: "from-image" });
  expect(drawImage).toHaveBeenCalledWith(oriented, 0, 0, 1536, 2048);
  expect(oriented.close).toHaveBeenCalledOnce();
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
  expect(prepared).toMatchObject({ name: "camera.jpg", size: 300_000, type: "image/jpeg", lastModified: 123 });
  expect(original.size).toBe(2_000_000);
});

it("keeps small JPEGs and other image formats without decoding them", async () => {
  const files = [photo("small.jpg", 768 * 1024), photo("diagram.png", 3_000_000, "image/png"), photo("phone.webp", 3_000_000, "image/webp")];
  const prepared = await prepareOperationalEvidencePhotos(files);

  for (const [index, file] of files.entries()) expect(prepared[index]).toBe(file);
  expect(decode).not.toHaveBeenCalled();
});

it("releases the previous bitmap before decoding the next camera photo", async () => {
  const first = bitmap();
  decode.mockResolvedValueOnce(first).mockImplementationOnce(async () => {
    expect(first.close).toHaveBeenCalledOnce();
    return bitmap(4032, 3024);
  });
  const files = [photo("first.jpg"), photo("second.jpg")];

  const prepared = await prepareOperationalEvidencePhotos(files);

  expect(decode).toHaveBeenCalledTimes(2);
  expect(prepared.map((file) => file.name)).toEqual(["first.jpg", "second.jpg"]);
});

it("keeps originals if decoding or JPEG encoding fails or savings are small", async () => {
  const files = [photo("decode.jpg"), photo("encode.jpg"), photo("savings.jpg")];
  decode.mockRejectedValueOnce(new Error("Unable to decode photo"));
  vi.mocked(HTMLCanvasElement.prototype.toBlob)
    .mockImplementationOnce((done) => done(null))
    .mockImplementationOnce((done) => done(new Blob([new Uint8Array(1_800_000)], { type: "image/jpeg" })));

  const prepared = await prepareOperationalEvidencePhotos(files);

  for (const [index, file] of files.entries()) expect(prepared[index]).toBe(file);
});

it("uses the original on browsers without createImageBitmap", async () => {
  vi.stubGlobal("createImageBitmap", undefined);
  const file = photo();
  expect((await prepareOperationalEvidencePhotos([file]))[0]).toBe(file);
});
