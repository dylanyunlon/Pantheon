export function getResults<T extends { results: any[] }>(x: T): T['results'] {
  return x.results
}

export function applyPageToken<X, T extends { pageToken: X | undefined }>(
  payload: T,
  { pageToken }: { pageToken: X | undefined }
): typeof payload | undefined {
  return pageToken
    ? { ...payload, pageToken }
    : undefined
}

export async function* pageRequestAsAsyncIter<P, Z, R>(
  call: (payload: P) => Promise<R>,
  values: (x: R) => Iterable<Z>,
  nextArgs: (previousPayload: P, previousResult: R) => P | undefined,
  initialPayload: P
): AsyncGenerator<Awaited<Z>, void, unknown> {
  let payload: P | undefined = initialPayload

  while (payload) {
    const r = await call(payload)
    for (const q of values(r)) {
      yield q
    }
    payload = nextArgs(payload, r)
  }
}
