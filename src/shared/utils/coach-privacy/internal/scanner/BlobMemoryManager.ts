export interface BlobMemoryManager {
  get(key: string): Blob | undefined
  add(key: string, blob: Blob): void
  remove(key: string): void
  clear(): void
  dispose(): void
  createBlobUrl(key: string): string | undefined
  releaseBlobUrl(key: string): void
  track(key: string, blob: Blob): void
  release(key: string): void
}
export function createBlobMemoryManager(): BlobMemoryManager {
  const blobs = new Map<string, Blob>()
  const urls = new Map<string, string>()
  return {
    get(key) { return blobs.get(key) },
    add(key, blob) { blobs.set(key, blob) },
    remove(key) { blobs.delete(key); const u = urls.get(key); if (u) { URL.revokeObjectURL(u); urls.delete(key) } },
    clear() { urls.forEach(u => URL.revokeObjectURL(u)); blobs.clear(); urls.clear() },
    dispose() { this.clear() },
    createBlobUrl(key) { const b = blobs.get(key); if (!b) return undefined; const u = URL.createObjectURL(b); urls.set(key, u); return u },
    releaseBlobUrl(key) { const u = urls.get(key); if (u) { URL.revokeObjectURL(u); urls.delete(key) } },
    track(key, blob) { this.add(key, blob) },
    release(key) { this.remove(key) },
  }
}
