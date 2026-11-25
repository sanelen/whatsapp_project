/** PostgREST caps a response. Fetch deterministic pages so financial totals never silently truncate. */
export async function readAllRows<T>(query: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: { code?: string; message: string } | null;
}>) {
  const data: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await query(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    data.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) return { data, error: null };
  }
}
