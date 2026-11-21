/**
 * One page of a list, for a `?pagina=N` parameter. The page is 1-based: a missing,
 * repeated, non-integer or non-positive value is page 1, and a page past the end is the last one.
 */
export function paginate<T>(items: T[], pageParam: string | string[] | undefined, size: number) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const raw = typeof pageParam === 'string' && /^[1-9]\d*$/.test(pageParam) ? Number(pageParam) : 1;
  const page = Math.min(raw, pageCount);
  return { items: items.slice((page - 1) * size, page * size), page, pageCount, total };
}
