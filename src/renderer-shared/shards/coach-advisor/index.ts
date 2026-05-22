import { IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import { CoachAdvice, CoachAdvicePriority } from '@shared/utils/coach-engine'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { PiniaMobxUtilsRenderer } from '../pinia-mobx-utils'
import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'

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
    private readonly _pm: PiniaMobxUtilsRenderer,
    private readonly _ipc: AkariIpcRenderer
  ) {}

  async onInit() {
    const store = useCoachAdvisorStore()
    this._pm.sync('coach-advisor-main', 'settings', store.settings, [
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
    this._pm.sync('coach-advisor-main', 'state', store.state, [
      'advices',
      'formattedMessages',
      'isGenerating',
      'lastGeneratedAt',
      'pipelineInfo'
    ])
  }
}
