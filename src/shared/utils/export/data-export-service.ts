import type { TrainingSample, FeatureVector, CaptureEvent } from '../capture/experiment-capture'

export interface ExportOptions {
  format: 'json' | 'csv'
  includeEvents: boolean
  includeSamples: boolean
  includeFeatureVectors: boolean
  prettyPrint: boolean
  filterOutcome?: 'win' | 'loss' | 'pending' | 'unknown'
}

const DEFAULT_OPTIONS: ExportOptions = {
  format: 'json',
  includeEvents: true,
  includeSamples: true,
  includeFeatureVectors: true,
  prettyPrint: false
}

export interface ExportPayload {
  meta: {
    exportedAt: number
    format: string
    sampleCount: number
    eventCount: number
    sessionId: string
  }
  samples: TrainingSample[]
  events: CaptureEvent[]
}

function featureVectorToCsvRow(fv: FeatureVector): string {
  return [
    fv.selfWinRate, fv.selfKda, fv.selfChampWinRate, fv.selfChampGames,
    fv.selfCsPerMinute, fv.selfVisionScore, fv.selfKillParticipation,
    fv.selfDamageShare, fv.selfLosingStreak, fv.selfWinningStreak,
    fv.selfRankNumeric,
    fv.allyAvgWinRate, fv.allyAvgKda, fv.allyAvgDamageShare,
    fv.allyAvgTankiness, fv.allyAvgVision, fv.allyTeamCompleteness,
    fv.enemyAvgWinRate, fv.enemyAvgKda, fv.enemyAvgDamageShare,
    fv.enemyAvgTankiness, fv.enemyAvgVision, fv.enemyTeamCompleteness,
    fv.overallDelta, fv.comparisonConfidence,
    fv.gameMode, fv.queueType, fv.phaseOrdinal,
    fv.premadeGroupMaxSize, fv.rankGapMax, fv.laneRankGap,
    fv.allyPhysDamageShare, fv.allyMagicDamageShare,
    fv.dataCompletenessRatio
  ].join(',')
}

const FEATURE_CSV_HEADER = [
  'selfWinRate', 'selfKda', 'selfChampWinRate', 'selfChampGames',
  'selfCsPerMinute', 'selfVisionScore', 'selfKillParticipation',
  'selfDamageShare', 'selfLosingStreak', 'selfWinningStreak',
  'selfRankNumeric',
  'allyAvgWinRate', 'allyAvgKda', 'allyAvgDamageShare',
  'allyAvgTankiness', 'allyAvgVision', 'allyTeamCompleteness',
  'enemyAvgWinRate', 'enemyAvgKda', 'enemyAvgDamageShare',
  'enemyAvgTankiness', 'enemyAvgVision', 'enemyTeamCompleteness',
  'overallDelta', 'comparisonConfidence',
  'gameMode', 'queueType', 'phaseOrdinal',
  'premadeGroupMaxSize', 'rankGapMax', 'laneRankGap',
  'allyPhysDamageShare', 'allyMagicDamageShare',
  'dataCompletenessRatio'
].join(',')

const SAMPLE_CSV_HEADER = FEATURE_CSV_HEADER +
  ',topAdviceType,topAdvicePriority,advisedTypesCount,phaseLabel,outcome,timestamp,sessionId'

function sampleToCsvRow(s: TrainingSample): string {
  const fvPart = featureVectorToCsvRow(s.featureVector)
  return `${fvPart},${s.topAdviceType},${s.topAdvicePriority},${s.advisedTypes.length},${s.phaseLabel},${s.outcome},${s.timestamp},${s.sessionId}`
}

function eventToCsvRow(e: CaptureEvent): string {
  return `${e.id},${e.kind},${e.timestamp},${e.sessionId},${e.gamePhase},${JSON.stringify(e.payload).replace(/,/g, ';')}`
}

const EVENT_CSV_HEADER = 'id,kind,timestamp,sessionId,gamePhase,payload'

export function exportToJson(payload: ExportPayload, options?: Partial<ExportOptions>): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const output: Record<string, unknown> = { meta: payload.meta }

  if (opts.includeSamples) {
    let samples = payload.samples
    if (opts.filterOutcome) {
      samples = samples.filter(s => s.outcome === opts.filterOutcome)
    }
    output.samples = samples
  }

  if (opts.includeEvents) {
    output.events = payload.events
  }

  return opts.prettyPrint ? JSON.stringify(output, null, 2) : JSON.stringify(output)
}

export function exportSamplesToCsv(samples: TrainingSample[], filterOutcome?: string): string {
  let filtered = samples
  if (filterOutcome) {
    filtered = samples.filter(s => s.outcome === filterOutcome)
  }
  const rows = [SAMPLE_CSV_HEADER]
  for (const s of filtered) {
    rows.push(sampleToCsvRow(s))
  }
  return rows.join('\n')
}

export function exportEventsToCsv(events: CaptureEvent[]): string {
  const rows = [EVENT_CSV_HEADER]
  for (const e of events) {
    rows.push(eventToCsvRow(e))
  }
  return rows.join('\n')
}

export function exportFeatureVectorsToCsv(samples: TrainingSample[]): string {
  const rows = [FEATURE_CSV_HEADER]
  for (const s of samples) {
    rows.push(featureVectorToCsvRow(s.featureVector))
  }
  return rows.join('\n')
}

export function createExportBlob(
  payload: ExportPayload,
  options?: Partial<ExportOptions>
): { blob: Blob; filename: string; mimeType: string } {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const timestamp = Date.now()

  if (opts.format === 'csv') {
    let content = ''
    if (opts.includeSamples) {
      content += '### SAMPLES ###\n'
      content += exportSamplesToCsv(payload.samples, opts.filterOutcome)
      content += '\n\n'
    }
    if (opts.includeEvents) {
      content += '### EVENTS ###\n'
      content += exportEventsToCsv(payload.events)
      content += '\n\n'
    }
    if (opts.includeFeatureVectors) {
      content += '### FEATURE VECTORS ###\n'
      content += exportFeatureVectorsToCsv(payload.samples)
    }
    return {
      blob: new Blob([content], { type: 'text/csv' }),
      filename: `coach-export-${timestamp}.csv`,
      mimeType: 'text/csv'
    }
  }

  const json = exportToJson(payload, opts)
  return {
    blob: new Blob([json], { type: 'application/json' }),
    filename: `coach-export-${timestamp}.json`,
    mimeType: 'application/json'
  }
}

export interface ExportStats {
  totalSamples: number
  winSamples: number
  lossSamples: number
  pendingSamples: number
  totalEvents: number
  uniquePhases: number
  uniqueAdviceTypes: number
  avgConfidence: number
  exportSizeEstimateBytes: number
}

export function computeExportStats(payload: ExportPayload): ExportStats {
  const samples = payload.samples
  const events = payload.events

  let winCount = 0
  let lossCount = 0
  let pendingCount = 0
  let totalConf = 0
  const phases = new Set<string>()
  const adviceTypes = new Set<string>()

  for (const s of samples) {
    if (s.outcome === 'win') winCount++
    else if (s.outcome === 'loss') lossCount++
    else pendingCount++
    phases.add(s.phaseLabel)
    for (const t of s.advisedTypes) adviceTypes.add(t)
    for (const c of s.advisedConfidences) totalConf += c
  }

  const totalConfEntries = samples.reduce((sum, s) => sum + s.advisedConfidences.length, 0)

  return {
    totalSamples: samples.length,
    winSamples: winCount,
    lossSamples: lossCount,
    pendingSamples: pendingCount,
    totalEvents: events.length,
    uniquePhases: phases.size,
    uniqueAdviceTypes: adviceTypes.size,
    avgConfidence: totalConfEntries > 0 ? totalConf / totalConfEntries : 0,
    exportSizeEstimateBytes: JSON.stringify(payload).length
  }
}
