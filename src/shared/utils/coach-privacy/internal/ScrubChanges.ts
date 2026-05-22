import { MultiMap } from "./collections/MultiMap"
import type { PiiCacheKey } from "./PiiCacheKey"
import type { ScrubOperationId } from "./ScrubOperationId"

export interface ScrubRecord {
  fieldPath: string
  originalLength: number
  scrubbedValue: string
  strategy: string
  timestamp: number
}

export class ScrubChanges {
  scrubbedFields: MultiMap<string, ScrubRecord> = new MultiMap()
  redactedFields: MultiMap<string, ScrubRecord> = new MultiMap()

  added: Set<PiiCacheKey> = new Set()
  modified: Set<PiiCacheKey> = new Set()
  deleted: Set<PiiCacheKey> = new Set()

  registerScrub = (
    fieldPath: string,
    record: ScrubRecord,
    isNew: boolean,
  ): void => {
    this[isNew ? "scrubbedFields" : "redactedFields"].set(
      fieldPath,
      record,
    )
  }

  deleteScrubRecord = (key: PiiCacheKey): void => {
    this.deleted.add(key)
  }

  registerFieldScrub = (key: PiiCacheKey): void => {
    this.modified.add(key)
  }

  isEmpty(): boolean {
    return (
      this.scrubbedFields.size === 0
      && this.redactedFields.size === 0
      && this.added.size === 0
      && this.modified.size === 0
      && this.deleted.size === 0
    )
  }

  getScrubSummary(): {
    totalScrubbed: number
    totalRedacted: number
    fieldPaths: string[]
  } {
    const paths = new Set<string>()
    for (const [path] of this.scrubbedFields) {
      paths.add(path)
    }
    for (const [path] of this.redactedFields) {
      paths.add(path)
    }
    return {
      totalScrubbed: this.scrubbedFields.size,
      totalRedacted: this.redactedFields.size,
      fieldPaths: Array.from(paths),
    }
  }
}

export function createScrubChanges(): ScrubChanges {
  return new ScrubChanges()
}

export function scrubChangesToString(changes: ScrubChanges): string {
  const summary = changes.getScrubSummary()
  return JSON.stringify(summary, null, 2)
}
