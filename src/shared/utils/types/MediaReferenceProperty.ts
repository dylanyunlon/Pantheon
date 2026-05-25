export interface MediaReferenceProperty {
  path: string
  mediaType: string
  fetchContents(client: unknown): Promise<Blob>
  getMediaMetadata(client: unknown): Promise<{ path: string; sizeBytes: number; mediaType: string; updatedAt?: string }>
  getMediaContent(client: unknown): Promise<Blob>
}
