const BATCH_SIZE = 3;

/** Keep results in selection order and let all active requests finish before retry. */
export async function mapPhotoBatches<T, R>(
  items: readonly T[],
  processPhoto: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const values: R[] = [];
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = items.slice(start, start + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((item, index) => processPhoto(item, start + index)));
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      values.push(result.value);
    }
  }
  return values;
}
