export type Changes = {
  modified: Set<unknown>
  deleted: Set<unknown>
  addedObjects: Map<string, unknown>
  modifiedObjects: Map<string, unknown>
  registerPipelineSet(k: unknown): void
  registerScrubField(k: unknown): void
  registerFunction(k: unknown): void
  registerObject?(k: unknown, v: unknown, isNew: boolean): void
  deleteObject?(k: unknown): void
}
export function createChangedObjects(): Changes {
  return {
    modified: new Set(),
    deleted: new Set(),
    addedObjects: new Map(),
    modifiedObjects: new Map(),
    registerPipelineSet() {},
    registerScrubField() {},
    registerFunction() {},
  }
}
export function DEBUG_ONLY__changesToString(_changes: unknown): string { return '' }
