import { Dep, IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import { CoachAdvice, CoachAdvicePriority } from '@shared/utils/coach-engine'
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
    showComposition: true
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
      'showComposition'
    ])
    this._pm.sync(COACH_SHARD_NAMESPACE, 'state', store.state, [
      'advices',
      'formattedMessages',
      'isGenerating',
      'lastGeneratedAt',
      'pipelineInfo'
    ])
  }
}
