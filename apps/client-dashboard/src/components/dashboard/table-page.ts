export function paginateTableRows<T>(rows: readonly T[], requestedPage: number, pageSize = 15) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  return { items: rows.slice(start, end), page, pageCount, start, end, total };
}
