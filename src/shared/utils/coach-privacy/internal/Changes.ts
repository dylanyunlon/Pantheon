import type { PiiFieldKey } from './PiiFieldKey'
export type Changes = { modified: Set<PiiFieldKey>; deleted: Set<PiiFieldKey>; addedObjects: Map<string, unknown>; modifiedObjects: Map<string, unknown>; registerPipelineSet(k: PiiFieldKey): void; registerScrubField(k: PiiFieldKey): void; registerFunction(k: PiiFieldKey): void }
export function DEBUG_ONLY__changesToString(_c: Changes): string { return '' }
