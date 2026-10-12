import type { SupabaseClient } from "@supabase/supabase-js";

/** Read-only, request-local signing. Keep private bucket permissions and every row. */
export async function signEvidencePhotos<T extends { storage_path: string }>(
  db: Pick<SupabaseClient, "storage">,
  bucket: string,
  photos: T[],
): Promise<Array<T & { url: string | undefined; signError: boolean }>> {
  if (!photos.length) return [];
  const paths = [...new Set(photos.map((photo) => photo.storage_path))];
  const urls = new Map<string, string>();
  const storage = db.storage.from(bucket);
  // Bound request sizes for long galleries instead of sending one request per photo.
  for (let offset = 0; offset < paths.length; offset += 100) {
    const chunk = paths.slice(offset, offset + 100);
    const { data, error } = await storage.createSignedUrls(chunk, 3600);
    if (error) {
      // Keep the existing single-file signing path as a bounded fallback.
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, chunk.length) }, async () => {
        while (next < chunk.length) {
          const path = chunk[next++];
          const signed = await storage.createSignedUrl(path, 3600);
          if (!signed.error && signed.data?.signedUrl) urls.set(path, signed.data.signedUrl);
        }
      }));
    } else for (const row of data || []) {
      if (row.path && row.signedUrl && !row.error) urls.set(row.path, row.signedUrl);
    }
  }
  return photos.map((photo) => ({ ...photo, url: urls.get(photo.storage_path), signError: !urls.has(photo.storage_path) }));
}
