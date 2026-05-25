import type { ScrubChanges } from "./ScrubChanges"
import type { PiiCacheKey } from "./PiiCacheKey"
import type { ScrubLayerEntry } from "./ScrubLayer"
import { ScrubLayer } from "./ScrubLayer"
import type { ScrubOperationId } from "./ScrubOperationId"
import type { ScrubContext } from "./ScrubContext"
import { ScrubSubjects } from "./ScrubSubjects"

export class ScrubLayers {
  private _truthLayer: ScrubLayer = new ScrubLayer(undefined, undefined)
  private _topLayer: ScrubLayer
  private _onScrubComplete: (
    changes: ScrubChanges,
    operationId?: ScrubOperationId,
  ) => Promise<void>

  readonly subjects: ScrubSubjects

  constructor(params: {
    onScrubComplete: (
      changes: ScrubChanges,
      operationId?: ScrubOperationId,
    ) => Promise<void>
  }) {
    this._topLayer = this._truthLayer
    this.subjects = new ScrubSubjects({ layers: this })
    this._onScrubComplete = params.onScrubComplete
  }

  get top(): ScrubLayer {
    return this._topLayer
  }

  get truth(): ScrubLayer {
    return this._truthLayer
  }

  remove(layerId: ScrubOperationId): void {
    let currentLayer: ScrubLayer | undefined = this._topLayer
    const cacheKeys = new Map<string, ScrubLayerEntry>()
    while (currentLayer != null && currentLayer.parentLayer != null) {
      if (currentLayer.layerId === layerId) {
        for (const [k, v] of currentLayer.entries()) {
          if (cacheKeys.has(k)) continue
          cacheKeys.set(k, v)
        }
      }
      currentLayer = currentLayer.parentLayer
    }

    this._topLayer = this._topLayer.removeLayer(layerId)

    for (const [, oldEntry] of cacheKeys) {
      const currentEntry = this._topLayer.get(oldEntry.cacheKey)
      if (oldEntry !== currentEntry) {
        const listener = this.subjects.peek(oldEntry.cacheKey)
        if (listener) {
          listener(currentEntry || {
            cacheKey: oldEntry.cacheKey,
            value: null,
            originalValue: null,
            status: "pending",
            lastScrubbed: Date.now(),
          })
        }
      }
    }
  }

  batch<X>(
    params: {
      operationId?: ScrubOperationId
      changes: ScrubChanges
    },
    batchFn: (context: ScrubContext) => X,
  ): {
    retVal: X
    changes: ScrubChanges
  } {
    const context = this._createScrubContext(params)
    const retVal = batchFn(context)

    this._onScrubComplete(params.changes, params.operationId).catch(e => {
      console.error("Unhandled error in scrub batch", e)
    })

    return { retVal, changes: context.changes }
  }

  private _createScrubContext(params: {
    operationId?: ScrubOperationId
    changes: ScrubChanges
  }): ScrubContext {
    let needsLayer = params.operationId !== undefined

    const context: ScrubContext = {
      changes: params.changes,
      createLayerIfNeeded: () => {
        if (needsLayer && params.operationId) {
          this._topLayer = this._topLayer.addLayer(params.operationId)
          needsLayer = false
        }
      },
      isScrubWrite: !!params.operationId,
      write: (cacheKey, value, status) => {
        if (params.operationId) context.createLayerIfNeeded()
        const writeLayer = params.operationId ? this._topLayer : this._truthLayer
        const entry: ScrubLayerEntry<typeof cacheKey> = {
          cacheKey,
          value,
          originalValue: this._truthLayer.get(cacheKey)?.value ?? value,
          status,
          lastScrubbed: Date.now(),
          operationId: params.operationId,
        }
        writeLayer.set(cacheKey, entry)
        const listener = this.subjects.peek(cacheKey)
        if (listener) listener(entry)
        return entry
      },
      read: (cacheKey) => {
        return params.operationId
          ? this._topLayer.get(cacheKey)
          : this._truthLayer.get(cacheKey)
      },
      delete: (cacheKey, status) => {
        return context.write(cacheKey, null, status)
      },
    }

    return context
  }
}
