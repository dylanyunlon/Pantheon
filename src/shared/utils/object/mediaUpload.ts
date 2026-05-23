export type MediaUploadMeta = { filename?: string }
export function isMediaUpload(v: unknown): boolean { return typeof v === 'object' && v !== null && 'data' in v }
export const MEDIA_UPLOAD_MARKER = Symbol('mediaUpload')
