export const historyPageSize = 50;

export function historyPage(value?: string | string[]) {
  const page = typeof value === "string" ? Number(value) : 1;
  return page > 0 && Number.isInteger(page) && Number.isSafeInteger(page * historyPageSize) ? page : 1;
}

export function HistoryNavigation({ path, page, more }: { path: string; page: number; more: boolean }) {
  if (page === 1 && !more) return null;
  return <nav className="actions" aria-label="History pages">
    {page > 1 && <a className="button secondary" href={page === 2 ? path : `${path}?page=${page - 1}`}>Newer records</a>}
    {more && <a className="button secondary" href={`${path}?page=${page + 1}`}>Older records</a>}
  </nav>;
}
