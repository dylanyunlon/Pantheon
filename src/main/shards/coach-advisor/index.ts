import { IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import {
  CoachAdvice,
  CoachAdvicePriority,
  CoachAdviceType,
  CoachEngine,
  createCoachEngine
} from '@shared/utils/coach-engine'
import { comparer } from 'mobx'
import { makeAutoObservable, observable, runInAction } from 'mobx'

import { AkariIpcMain } from '../ipc'
import { LeagueClientMain } from '../league-client'
import { AkariLogger, LoggerFactoryMain } from '../logger-factory'
import { MobxUtilsMain } from '../mobx-utils'
import { OngoingGameMain } from '../ongoing-game'
import { SettingFactoryMain } from '../setting-factory'
import { SetterSettingService } from '../setting-factory/setter-setting-service'

export class CoachAdvisorSettings {
  enabled: boolean = false
  maxAdviceCount: number = 6
  autoGenerateInChampSelect: boolean = true
  autoGenerateInGame: boolean = true
  minPriority: CoachAdvicePriority = CoachAdvicePriority.INFO
  showEnemyWeakness: boolean = true
  showTeamSynergy: boolean = true
  showMacroStrategy: boolean = true
  showMentalAdvice: boolean = true
  showLaneMatchup: boolean = true
  showRankDisparity: boolean = true
  showComposition: boolean = true

  setEnabled(v: boolean) {
    this.enabled = v
  }

  constructor() {
    makeAutoObservable(this)
  }
}

export class CoachAdvisorState {
  advices: CoachAdvice[] = []
  formattedMessages: string[] = []
  isGenerating: boolean = false
  lastGeneratedAt: number = 0
  pipelineInfo: {
    allyAvgScore: number
    enemyAvgScore: number
    scoreDiff: number
  } | null = null

  setAdvices(advices: CoachAdvice[]) {
    this.advices = advices
  }

  setFormattedMessages(msgs: string[]) {
    this.formattedMessages = msgs
  }

  setIsGenerating(v: boolean) {
    this.isGenerating = v
  }

  clear() {
    this.advices = []
    this.formattedMessages = []
    this.isGenerating = false
    this.lastGeneratedAt = 0
    this.pipelineInfo = null
  }

  constructor() {
    makeAutoObservable(this, {
      advices: observable.ref,
      formattedMessages: observable.ref
    })
  }
}

@Shard(CoachAdvisorMain.id)
export class CoachAdvisorMain implements IAkariShardInitDispose {
  static id = 'coach-advisor-main'

  private readonly _log: AkariLogger
  private readonly _setting: SetterSettingService
  private _engine: CoachEngine

  public readonly settings = new CoachAdvisorSettings()
  public readonly state = new CoachAdvisorState()

  constructor(
    private readonly _loggerFactory: LoggerFactoryMain,
    private readonly _settingFactory: SettingFactoryMain,
    private readonly _lc: LeagueClientMain,
    private readonly _mobx: MobxUtilsMain,
    private readonly _ipc: AkariIpcMain,
    private readonly _og: OngoingGameMain
  ) {
    this._log = _loggerFactory.create(CoachAdvisorMain.id)
    this._engine = createCoachEngine()
    this._setting = _settingFactory.register(
      CoachAdvisorMain.id,
      {
        enabled: { default: this.settings.enabled },
        maxAdviceCount: { default: this.settings.maxAdviceCount },
        autoGenerateInChampSelect: { default: this.settings.autoGenerateInChampSelect },
        autoGenerateInGame: { default: this.settings.autoGenerateInGame },
        minPriority: { default: this.settings.minPriority },
        showEnemyWeakness: { default: this.settings.showEnemyWeakness },
        showTeamSynergy: { default: this.settings.showTeamSynergy },
        showMacroStrategy: { default: this.settings.showMacroStrategy },
        showMentalAdvice: { default: this.settings.showMentalAdvice },
        showLaneMatchup: { default: this.settings.showLaneMatchup },
        showRankDisparity: { default: this.settings.showRankDisparity },
        showComposition: { default: this.settings.showComposition }
      },
      this.settings
    )
  }

  async onInit() {
    await this._handleState()
    this._handleAutoGeneration()
    this._handleIpcCall()
  }

  async onDispose() {
    this._engine.dispose()
    this.state.clear()
  }

  private async _handleState() {
    await this._setting.applyToState()
    this._mobx.propSync(CoachAdvisorMain.id, 'settings', this.settings, [
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
    this._mobx.propSync(CoachAdvisorMain.id, 'state', this.state, [
      'advices',
      'formattedMessages',
      'isGenerating',
      'lastGeneratedAt',
      'pipelineInfo'
    ])
  }

  private _handleAutoGeneration() {
    this._mobx.reaction(
      () => this._og.state.queryStage.phase,
      (phase) => {
        if (phase === 'unavailable') {
          this.state.clear()
          this._engine.clearCache()
          this._ipc.sendEvent(CoachAdvisorMain.id, 'clear')
        }
      }
    )

    this._mobx.reaction(
      () => this._og.state.playerStats,
      (playerStats) => {
        if (!this.settings.enabled || !playerStats) return
        const phase = this._og.state.queryStage.phase
        if (phase === 'champ-select' && !this.settings.autoGenerateInChampSelect) return
        if (phase === 'in-game' && !this.settings.autoGenerateInGame) return
        if (phase === 'unavailable') return
        this._generateAdvices()
      },
      { delay: 500 }
    )
  }

  private _generateAdvices() {
    try {
      runInAction(() => (this.state.isGenerating = true))

      const selfPuuid = this._lc.data.summoner.me?.puuid
      if (!selfPuuid) {
        this._log.warn('Self puuid not available')
        return
      }

      const teams = this._og.state.teams || {}
      const teamEntries = Object.entries(teams)
      const selfTeamEntry = teamEntries.find(([, members]) => members.includes(selfPuuid))
      const allyMembers = selfTeamEntry ? selfTeamEntry[1] : []
      const enemyMembers = teamEntries
        .filter(([teamId]) => teamId !== selfTeamEntry?.[0])
        .flatMap(([, members]) => members)

      const gameInfo = this._og.state.queryStage.gameInfo

      const generateParams = {
        playerStats: this._og.state.playerStats,
        championSelections: this._og.state.championSelections,
        positionAssignments: this._og.state.positionAssignments,
        rankedStats: this._og.state.rankedStats as any,
        selfPuuid,
        allyMembers,
        enemyMembers,
        gameMode: gameInfo?.gameMode || '',
        queueType: gameInfo?.queueType || '',
        inferredPremadeTeams: this._og.state.inferredPremadeTeams
      }

      const advices = this._engine.generateAdvices(generateParams)

      let filtered = advices
      if (!this.settings.showEnemyWeakness)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.ENEMY_WEAKNESS)
      if (!this.settings.showTeamSynergy)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.TEAM_SYNERGY)
      if (!this.settings.showMacroStrategy)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.MACRO_STRATEGY)
      if (!this.settings.showMentalAdvice)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.MENTAL)
      if (!this.settings.showLaneMatchup)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.LANE_MATCHUP)
      if (!this.settings.showRankDisparity)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.RANK_DISPARITY)
      if (!this.settings.showComposition)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.COMPOSITION)

      const truncated = filtered.slice(0, this.settings.maxAdviceCount)
      const messages = this._engine.formatAsMessages(truncated, {
        maxLines: this.settings.maxAdviceCount,
        minPriority: this.settings.minPriority
      })

      const pipelineInfo = this._engine.getLastPipelineInfo({
        playerStats: this._og.state.playerStats,
        allyMembers,
        enemyMembers,
        selfPuuid
      })

      runInAction(() => {
        this.state.advices = truncated
        this.state.formattedMessages = messages
        this.state.lastGeneratedAt = Date.now()
        this.state.isGenerating = false
        this.state.pipelineInfo = pipelineInfo
      })

      this._ipc.sendEvent(CoachAdvisorMain.id, 'advices-generated', truncated, messages)
      this._log.info(
        `Generated ${truncated.length} coach advices`,
        truncated.map((a) => `[${a.priority}] ${a.title}`).join(', ')
      )
    } catch (error) {
      this._log.warn('Error generating coach advices', error)
      runInAction(() => (this.state.isGenerating = false))
    }
  }

  private _handleIpcCall() {
    this._ipc.onCall(CoachAdvisorMain.id, 'generate', () => {
      this._generateAdvices()
      return { advices: this.state.advices, messages: this.state.formattedMessages }
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getAdvices', () => {
      return {
        advices: this.state.advices,
        messages: this.state.formattedMessages,
        pipelineInfo: this.state.pipelineInfo
      }
    })

    this._ipc.onCall(
      CoachAdvisorMain.id,
      'getFormattedMessages',
      (_, options?: { audience?: string; maxLines?: number }) => {
        return this._engine.formatAsMessages(this.state.advices, {
          maxLines: options?.maxLines || this.settings.maxAdviceCount,
          audience: (options?.audience as any) || undefined,
          minPriority: this.settings.minPriority
        })
      }
    )
  }
}
