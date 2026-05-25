import type { PiiFieldCategory } from "../PiiCacheKey"
import type { ScrubStatus } from "../ScrubCanonical"
import type { ScrubOperationId } from "../ScrubOperationId"

export interface AuditEntry {
  operationId: ScrubOperationId | string
  timestamp: number
  fieldPath: string
  category: PiiFieldCategory
  action: string
  status: ScrubStatus
  originalLength: number
  scrubbedLength: number
  source: string
  sessionId: string
}

export interface AuditSummary {
  totalOperations: number
  operationsByCategory: Record<string, number>
  operationsByAction: Record<string, number>
  operationsBySource: Record<string, number>
  averageOriginalLength: number
  averageScrubbedLength: number
  compressionRatio: number
  firstOperation: number
  lastOperation: number
  uniqueFieldPaths: number
  uniqueSessions: number
}

export class AuditLog {
  private _entries: AuditEntry[] = []
  private _maxEntries: number
  private _listeners: Array<(entry: AuditEntry) => void> = []

  constructor(maxEntries: number = 10000) {
    this._maxEntries = maxEntries
  }

  record(entry: AuditEntry): void {
    if (this._entries.length >= this._maxEntries) {
      this._entries.shift()
    }
    this._entries.push(entry)
    for (const listener of this._listeners) {
      try { listener(entry) } catch (_) {}
    }
  }

  getEntries(filter?: {
    category?: PiiFieldCategory
    source?: string
    sessionId?: string
    since?: number
    limit?: number
  }): AuditEntry[] {
    let result = this._entries
    if (filter?.category) {
      result = result.filter(e => e.category === filter.category)
    }
    if (filter?.source) {
      result = result.filter(e => e.source === filter.source)
    }
    if (filter?.sessionId) {
      result = result.filter(e => e.sessionId === filter.sessionId)
    }
    if (filter?.since) {
      result = result.filter(e => e.timestamp >= filter.since!)
    }
    if (filter?.limit) {
      result = result.slice(-filter.limit)
    }
    return result
  }

  getSummary(): AuditSummary {
    const entries = this._entries
    if (entries.length === 0) {
      return {
        totalOperations: 0,
        operationsByCategory: {},
        operationsByAction: {},
        operationsBySource: {},
        averageOriginalLength: 0,
        averageScrubbedLength: 0,
        compressionRatio: 0,
        firstOperation: 0,
        lastOperation: 0,
        uniqueFieldPaths: 0,
        uniqueSessions: 0,
      }
    }

    const byCategory: Record<string, number> = {}
    const byAction: Record<string, number> = {}
    const bySource: Record<string, number> = {}
    const fieldPaths = new Set<string>()
    const sessions = new Set<string>()
    let totalOrigLen = 0
    let totalScrubLen = 0

    for (const entry of entries) {
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1
      byAction[entry.action] = (byAction[entry.action] || 0) + 1
      bySource[entry.source] = (bySource[entry.source] || 0) + 1
      fieldPaths.add(entry.fieldPath)
      sessions.add(entry.sessionId)
      totalOrigLen += entry.originalLength
      totalScrubLen += entry.scrubbedLength
    }

    return {
      totalOperations: entries.length,
      operationsByCategory: byCategory,
      operationsByAction: byAction,
      operationsBySource: bySource,
      averageOriginalLength: totalOrigLen / entries.length,
      averageScrubbedLength: totalScrubLen / entries.length,
      compressionRatio: totalOrigLen > 0 ? totalScrubLen / totalOrigLen : 1,
      firstOperation: entries[0].timestamp,
      lastOperation: entries[entries.length - 1].timestamp,
      uniqueFieldPaths: fieldPaths.size,
      uniqueSessions: sessions.size,
    }
  }

  onRecord(listener: (entry: AuditEntry) => void): () => void {
    this._listeners.push(listener)
    return () => {
      const idx = this._listeners.indexOf(listener)
      if (idx >= 0) this._listeners.splice(idx, 1)
    }
  }

  get length(): number {
    return this._entries.length
  }

  clear(): void {
    this._entries = []
  }

  dispose(): void {
    this.clear()
    this._listeners = []
  }

  exportAsJson(): string {
    return JSON.stringify({
      summary: this.getSummary(),
      entries: this._entries,
    }, null, 2)
  }
}
