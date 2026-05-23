export function streamToAsyncIterator<T>(_stream: ReadableStream<T>): AsyncIterableIterator<T> { return (async function*() {})() }
export function createStreamParser(): any { return {} }

export async function* iterateReadableStream<T>(stream: ReadableStream<T>): AsyncGenerator<T> {
  const reader = stream.getReader()
  try { while (true) { const { done, value } = await reader.read(); if (done) return; yield value } }
  finally { reader.releaseLock() }
}
export async function* parseNdjsonStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of iterateReadableStream(stream)) {
    buffer += decoder.decode(chunk as any, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) { if (line.trim()) yield JSON.parse(line) }
  }
  if (buffer.trim()) yield JSON.parse(buffer)
}
