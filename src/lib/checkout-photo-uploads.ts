const SIGN_CONCURRENCY = 4;
export const CHECKOUT_PHOTO_UPLOAD_CONCURRENCY = 3;

export async function mapCheckoutPhotos<Input, Output>(
  photos: readonly Input[],
  concurrency: number,
  run: (photo: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  const results: Output[] = [];
  let next = 0;
  let failure: { reason: unknown } | undefined;

  async function worker() {
    while (!failure && next < photos.length) {
      const index = next++;
      try {
        results[index] = await run(photos[index], index);
      } catch (reason) {
        failure ??= { reason };
      }
    }
  }

  // Let in-flight transfers finish before returning an error and allowing a retry.
  await Promise.all(Array.from({ length: Math.min(concurrency, photos.length) }, worker));
  if (failure) throw failure.reason;
  return results;
}

type UploadSigner = {
  createSignedUploadUrl(path: string): Promise<{
    data: { token: string } | null;
    error: { message: string } | null;
  }>;
};

export async function signCheckoutPhotoUploads(
  storage: UploadSigner,
  folder: string,
  photos: readonly { type: string }[],
  fallback: string,
): Promise<{ uploads: { path: string; token: string }[] } | { error: string }> {
  try {
    const uploads = await mapCheckoutPhotos(photos, SIGN_CONCURRENCY, async ({ type }) => {
      const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const path = `${folder}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error || !data?.token) throw new Error(error?.message || fallback);
      return { path, token: data.token };
    });
    return { uploads };
  } catch (error) {
    return { error: error instanceof Error ? error.message : fallback };
  }
}
