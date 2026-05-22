import type { ScrubChanges } from "./ScrubChanges"
import type { PiiCacheKey } from "./PiiCacheKey"
import type { ScrubLayerEntry } from "./ScrubLayer"

export interface ScrubContext {
  changes: ScrubChanges
  createLayerIfNeeded: () => void
  isScrubWrite: boolean

  write: <K extends PiiCacheKey>(
    k: K,
    v: ScrubLayerEntry<K>["value"],
    status: ScrubLayerEntry<K>["status"],
  ) => ScrubLayerEntry<K>

  read: <K extends PiiCacheKey>(
    k: K,
  ) => ScrubLayerEntry<K> | undefined

  delete: <K extends PiiCacheKey>(
    k: K,
    status: ScrubLayerEntry<K>["status"],
  ) => ScrubLayerEntry<K>
}

export interface ScrubPipelineContext {
  sessionId: string
  gamePhase: string
  scrubStrategy: string
  knownPuuids: string[]
  fieldAllowlist: Set<string>
  depth: number
  maxDepth: number
  parentPath: string
}

export function createScrubPipelineContext(params: {
  sessionId: string
  gamePhase?: string
  scrubStrategy?: string
  knownPuuids?: string[]
}): ScrubPipelineContext {
  return {
    sessionId: params.sessionId,
    gamePhase: params.gamePhase || "unknown",
    scrubStrategy: params.scrubStrategy || "hash",
    knownPuuids: params.knownPuuids || [],
    fieldAllowlist: new Set([
      "gameMode", "queueType", "gamePhase", "championId", "championName",
      "type", "kind", "outcome", "phase", "from", "to", "feedback",
      "adviceType", "title", "message", "reasoning", "confidence",
      "priority", "audience", "kills", "deaths", "assists", "kda",
      "goldEarned", "damageDealt", "items", "subteamId", "subteamStanding",
    ]),
    depth: 0,
    maxDepth: 10,
    parentPath: "",
  }
}
