export type BlobMemoryManager = { track(key: string, blob: Blob): void; release(key: string): void }
export function createBlobMemoryManager(): BlobMemoryManager { return { track() {}, release() {} } }
