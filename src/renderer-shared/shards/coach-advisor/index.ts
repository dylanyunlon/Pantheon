import { Dep, IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import { CoachAdvice, CoachAdvicePriority } from '@shared/utils/coach-engine'
import type { GamePhase } from '@shared/utils/coach-scheduler'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { PiniaMobxUtilsRenderer } from '../pinia-mobx-utils'
import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { SettingUtilsRenderer } from '@renderer-shared/shards/setting-utils'

const COACH_SHARD_NAMESPACE = 'coach-advisor-main'

export const useCoachAdvisorStore = defineStore('coach-advisor', () => {
  const settings = ref({
    enabled: false,
    maxAdviceCount: 6,
    autoGenerateInChampSelect: true,
    autoGenerateInGame: true,
    minPriority: CoachAdvicePriority.INFO as CoachAdvicePriority,
    showEnemyWeakness: true,
    showTeamSynergy: true,
    showMacroStrategy: true,
    showMentalAdvice: true,
    showLaneMatchup: true,
    showRankDisparity: true,
    showComposition: true,
    showItemization: true,
    showObjectiveTiming: true,
    showPlaystyleAdaptation: true,
    showGoldEfficiency: true,
    showTrueDamageWarning: true,
    showWinCondition: true,
    showKdaTrend: true,
    captureEnabled: false,
    captureAutoFlushInterval: 15000,
    captureEventCapacity: 500,
    captureSampleCapacity: 100,
    captureShowStatsInPanel: false,
    captureExportFormat: 'json' as 'json' | 'csv'
  })

  const state = ref({
    advices: [] as CoachAdvice[],
    formattedMessages: [] as string[],
    isGenerating: false,
    lastGeneratedAt: 0,
    pipelineInfo: null as {
      allyAvgScore: number
      enemyAvgScore: number
      scoreDiff: number
    } | null,
    currentGamePhase: 'unknown' as GamePhase,
    schedulerStats: null as {
      totalQueued: number
      delivered: number
      avgRelevance: number
    } | null,
    teamComparisonSummary: null as {
      overallDelta: number
      confidence: number
    } | null
  })

  return { settings, state }
})

@Shard()
export class CoachAdvisorRenderer implements IAkariShardInitDispose {
  static id = 'coach-advisor-renderer'

  constructor(
    @Dep(PiniaMobxUtilsRenderer) private readonly _pm: PiniaMobxUtilsRenderer,
    @Dep(AkariIpcRenderer) private readonly _ipc: AkariIpcRenderer,
    @Dep(SettingUtilsRenderer) private readonly _setting: SettingUtilsRenderer
  ) {}

  setEnabled(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'enabled', value)
  }

  setMaxAdviceCount(value: number) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'maxAdviceCount', value)
  }

  setAutoGenerateInChampSelect(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'autoGenerateInChampSelect', value)
  }

  setAutoGenerateInGame(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'autoGenerateInGame', value)
  }

  setMinPriority(value: CoachAdvicePriority) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'minPriority', value)
  }

  setShowEnemyWeakness(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showEnemyWeakness', value)
  }

  setShowTeamSynergy(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showTeamSynergy', value)
  }

  setShowMacroStrategy(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showMacroStrategy', value)
  }

  setShowMentalAdvice(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showMentalAdvice', value)
  }

  setShowLaneMatchup(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showLaneMatchup', value)
  }

  setShowRankDisparity(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showRankDisparity', value)
  }

  setShowComposition(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showComposition', value)
  }

  setShowItemization(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showItemization', value)
  }

  setShowObjectiveTiming(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showObjectiveTiming', value)
  }

  setShowPlaystyleAdaptation(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showPlaystyleAdaptation', value)
  }

  setShowGoldEfficiency(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showGoldEfficiency', value)
  }

  setShowTrueDamageWarning(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showTrueDamageWarning', value)
  }

  setShowWinCondition(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showWinCondition', value)
  }

  setShowKdaTrend(value: boolean) {
    return this._setting.set(COACH_SHARD_NAMESPACE, 'showKdaTrend', value)
  }

  setCaptureEnabled(value: boolean) { return this._setting.set(COACH_SHARD_NAMESPACE, 'captureEnabled', value) }
  setCaptureAutoFlushInterval(value: number) { return this._setting.set(COACH_SHARD_NAMESPACE, 'captureAutoFlushInterval', value) }
  setCaptureEventCapacity(value: number) { return this._setting.set(COACH_SHARD_NAMESPACE, 'captureEventCapacity', value) }
  setCaptureSampleCapacity(value: number) { return this._setting.set(COACH_SHARD_NAMESPACE, 'captureSampleCapacity', value) }
  setCaptureShowStatsInPanel(value: boolean) { return this._setting.set(COACH_SHARD_NAMESPACE, 'captureShowStatsInPanel', value) }
  setCaptureExportFormat(value: 'json' | 'csv') { return this._setting.set(COACH_SHARD_NAMESPACE, 'captureExportFormat', value) }

  getSchedulerStats() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getSchedulerStats') as Promise<Record<string, number>>
  }

  getCaptureStats() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getCaptureStats') as Promise<{
      sessionId: string
      isActive: boolean
      eventCount: number
      sampleCount: number
      mergeCount: number
    }>
  }

  getLoadProgress() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getLoadProgress') as Promise<{
      loaded: number
      total: number
      percentage: number
    }>
  }

  getFailedPuuids() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getFailedPuuids') as Promise<string[]>
  }

  generateAdvices() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'generate') as Promise<{
      advices: CoachAdvice[]
      messages: string[]
    }>
  }

  getAdvices() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getAdvices') as Promise<{
      advices: CoachAdvice[]
      messages: string[]
      pipelineInfo: { allyAvgScore: number; enemyAvgScore: number; scoreDiff: number } | null
    }>
  }

  getFormattedMessages(options?: { audience?: string; maxLines?: number }) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getFormattedMessages', options) as Promise<
      string[]
    >
  }

  getDataAvailability() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getDataAvailability') as Promise<{
      summary: {
        totalPlayers: number
        fullyLoaded: number
        partiallyLoaded: number
        loading: number
        errors: number
      }
      availability: Record<string, any>
    }>
  }

  getPlayerCompleteness(puuid: string) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getPlayerCompleteness', puuid) as Promise<{
      puuid: string
      completeness: number
      isReady: boolean
      isFullyLoaded: boolean
    }>
  }

  getSchedulerStats() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getSchedulerStats') as Promise<{
      totalQueued: number
      delivered: number
      expired: number
      suppressed: number
      avgRelevance: number
      currentPhase: string
      phaseTransitions: number
    }>
  }

  getTeamComparison() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getTeamComparison') as Promise<{
      overallDelta: number
      confidence: number
      aggregatedTeamScore: number
    } | null>
  }

  getScheduledAdvices(count?: number) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getScheduledAdvices', count) as Promise<string[]>
  }

  suppressAdviceType(type: string) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'suppressAdviceType', type)
  }

  unsuppressAdviceType(type: string) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'unsuppressAdviceType', type)
  }

  getExperimentExport() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getExperimentExport') as Promise<{
      meta: {
        sessionId: string
        startedAt: number
        endedAt: number | null
        gameMode: string
        queueType: string
        selfPuuid: string
        eventCount: number
        sampleCount: number
        phases: string[]
      }
      events: any[]
      samples: any[]
      accumulatorStats: Record<string, { avg: number; min: number; max: number; count: number }>
    }>
  }

  getTrainingSamples() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getTrainingSamples') as Promise<any[]>
  }

  getCaptureStats() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getCaptureStats') as Promise<{
      sessionId: string
      isActive: boolean
      eventCount: number
      sampleCount: number
      mergeCount: number
    }>
  }

  recordFeedback(adviceType: string, feedback: 'helpful' | 'not-helpful' | 'dismiss') {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'recordFeedback', adviceType, feedback)
  }

  setGameOutcome(sessionId: string, outcome: 'win' | 'loss' | 'unknown') {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'setGameOutcome', sessionId, outcome) as Promise<number>
  }

  getInferenceStats() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getInferenceStats') as Promise<{
      totalInferences: number
      avgLatencyMs: number
      errors: number
      cacheSize: number
      isReady: boolean
      backend: string
    }>
  }

  loadInferenceModel(modelPath: string) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'loadInferenceModel', modelPath) as Promise<boolean>
  }

  switchInferenceBackend(backend: string) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'switchInferenceBackend', backend)
  }

  createExperiment(params: { name: string; description?: string; trafficSplit?: number }) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'createExperiment', params) as Promise<{
      experimentId: string; name: string; status: string; variants: any[]
    }>
  }

  startExperiment(experimentId: string) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'startExperiment', experimentId) as Promise<boolean>
  }

  completeExperiment(experimentId: string) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'completeExperiment', experimentId) as Promise<{
      experimentId: string; variants: any; comparisonResult: any
    } | null>
  }

  getExperimentSnapshot(experimentId: string) {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getExperimentSnapshot', experimentId) as Promise<{
      experimentId: string; variants: any; totalSessions: number; comparisonResult: any
    } | null>
  }

  listExperiments() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'listExperiments') as Promise<any[]>
  }

  getObservableStoreStats() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getObservableStoreStats') as Promise<{
      subjectCount: number; activeRefs: number; pendingGc: number
      totalWrites: number; totalReads: number; totalNotifications: number
    }>
  }

  getReplayReports() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getReplayReports') as Promise<any[]>
  }

  getLatestReplayReport() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getLatestReplayReport') as Promise<{
      gameId: number
      outcome: { outcome: string; gameDurationSeconds: number }
      overallAccuracy: number
      backfilledSamples: number
      adviceAccuracy: Array<{ adviceType: string; accuracyScore: number; wasAccurate: boolean }>
    } | null>
  }

  getAccuracyHistory() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getAccuracyHistory') as Promise<{
      totalReports: number; avgAccuracy: number
      accuracyByType: Record<string, { avg: number; count: number }>
      winCorrelation: number
    }>
  }

  getPredictionErrors() {
    return this._ipc.call(COACH_SHARD_NAMESPACE, 'getPredictionErrors') as Promise<{
      avgPredictionError: number
      errors: Array<{ gameId: number; predicted: number; actual: number; error: number }>
    }>
  }

  async onInit() {
    const store = useCoachAdvisorStore()
    this._pm.sync(COACH_SHARD_NAMESPACE, 'settings', store.settings, [
      'enabled',
      'maxAdviceCount',
      'autoGenerateInChampSelect',
      'autoGenerateInGame',
      'minPriority',
      'showEnemyWeakness',
      'showTeamSynergy',
      'showMacroStrategy',
      'showMentalAdvice',
      'showLaneMatchup',
      'showRankDisparity',
      'showComposition',
      'showItemization',
      'showObjectiveTiming',
      'showPlaystyleAdaptation',
      'showGoldEfficiency',
      'showTrueDamageWarning',
      'showWinCondition',
      'showKdaTrend',
      'captureEnabled',
      'captureAutoFlushInterval',
      'captureEventCapacity',
      'captureSampleCapacity',
      'captureShowStatsInPanel',
      'captureExportFormat'
    ])
    this._pm.sync(COACH_SHARD_NAMESPACE, 'state', store.state, [
      'advices',
      'formattedMessages',
      'isGenerating',
      'lastGeneratedAt',
      'pipelineInfo',
      'currentGamePhase',
      'schedulerStats',
      'teamComparisonSummary'
    ])
  }
}
