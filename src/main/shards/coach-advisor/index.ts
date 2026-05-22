import { IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import {
  CoachAdvice,
  CoachAdvicePriority,
  CoachAdviceType,
  CoachEngine,
  createCoachEngine
} from '@shared/utils/coach-engine'
import { getPhaseDisplayName } from '@shared/utils/coach-scheduler'
import { CoachDataTracker } from '@shared/utils/coach-cache'
import type { CoachDataType, CoachQueryStatus } from '@shared/utils/coach-cache'
import type { GamePhase } from '@shared/utils/coach-scheduler'
import { mapQueryPhaseToGamePhase } from '@shared/utils/coach-scheduler'
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
  showItemization: boolean = true
  showObjectiveTiming: boolean = true
  showPlaystyleAdaptation: boolean = true
  showGoldEfficiency: boolean = true
  showTrueDamageWarning: boolean = true
  showWinCondition: boolean = true
  showKdaTrend: boolean = true
  captureEnabled: boolean = false
  captureAutoFlushInterval: number = 15000
  captureEventCapacity: number = 500
  captureSampleCapacity: number = 100
  captureShowStatsInPanel: boolean = false
  captureExportFormat: 'json' | 'csv' = 'json'

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
  currentGamePhase: GamePhase = 'unknown'
  schedulerStats: {
    totalQueued: number
    delivered: number
    avgRelevance: number
  } | null = null
  teamComparisonSummary: {
    overallDelta: number
    confidence: number
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
    this.currentGamePhase = 'unknown'
    this.schedulerStats = null
    this.teamComparisonSummary = null
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
  private _dataTracker: CoachDataTracker

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
    this._dataTracker = new CoachDataTracker()
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
        showComposition: { default: this.settings.showComposition },
        showItemization: { default: this.settings.showItemization },
        showObjectiveTiming: { default: this.settings.showObjectiveTiming },
        showPlaystyleAdaptation: { default: this.settings.showPlaystyleAdaptation },
        showGoldEfficiency: { default: this.settings.showGoldEfficiency },
        showTrueDamageWarning: { default: this.settings.showTrueDamageWarning },
        showWinCondition: { default: this.settings.showWinCondition },
        showKdaTrend: { default: this.settings.showKdaTrend },
        captureEnabled: { default: this.settings.captureEnabled },
        captureAutoFlushInterval: { default: this.settings.captureAutoFlushInterval },
        captureEventCapacity: { default: this.settings.captureEventCapacity },
        captureSampleCapacity: { default: this.settings.captureSampleCapacity },
        captureShowStatsInPanel: { default: this.settings.captureShowStatsInPanel },
        captureExportFormat: { default: this.settings.captureExportFormat }
      },
      this.settings
    )
  }

  async onInit() {
    await this._handleState()
    this._handleAutoGeneration()
    this._handleDataTracking()
    this._handleIpcCall()
  }

  async onDispose() {
    this._engine.dispose()
    this._dataTracker.clear()
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
    this._mobx.propSync(CoachAdvisorMain.id, 'state', this.state, [
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

  private _handleAutoGeneration() {
    this._mobx.reaction(
      () => this._og.state.queryStage.phase,
      (phase) => {
        if (phase === 'unavailable') {
          const sessionMeta = this._engine.endExperimentSession()
          if (sessionMeta.eventCount > 0) {
            this._log.info(
              `Experiment session ended: ${sessionMeta.sessionId}, ` +
              `${sessionMeta.eventCount} events, ${sessionMeta.sampleCount} samples`
            )
          }
          this.state.clear()
          this._engine.clearCache()
          this._ipc.sendEvent(CoachAdvisorMain.id, 'clear')
        } else if (phase === 'champ-select' || phase === 'in-game') {
          const selfPuuid = this._lc.data.summoner.me?.puuid
          if (selfPuuid) {
            const gameInfo = this._og.state.queryStage.gameInfo
            this._engine.startExperimentSession({
              gameMode: gameInfo?.gameMode || '',
              queueType: gameInfo?.queueType || '',
              selfPuuid
            })
            this._log.info(`Experiment session started for phase: ${phase}`)
          }
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

  private _handleDataTracking() {
    this._mobx.reaction(
      () => this._og.state.matchHistoryLoadingState,
      (states) => {
        for (const [puuid, status] of Object.entries(states)) {
          const mapped = status === 'loaded' ? 'loaded' : status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'init'
          this._dataTracker.setStatus(puuid, 'match-history', mapped as any)
        }
      },
      { fireImmediately: true }
    )

    this._mobx.reaction(
      () => this._og.state.rankedStatsLoadingState,
      (states) => {
        for (const [puuid, status] of Object.entries(states)) {
          const mapped = status === 'loaded' ? 'loaded' : status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'init'
          this._dataTracker.setStatus(puuid, 'ranked', mapped as any)
        }
      },
      { fireImmediately: true }
    )

    this._mobx.reaction(
      () => this._og.state.championMasteryLoadingState,
      (states) => {
        for (const [puuid, status] of Object.entries(states)) {
          const mapped = status === 'loaded' ? 'loaded' : status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'init'
          this._dataTracker.setStatus(puuid, 'champion-mastery', mapped as any)
        }
      },
      { fireImmediately: true }
    )

    this._mobx.reaction(
      () => this._og.state.playerStats,
      (playerStats) => {
        if (!playerStats) return
        for (const puuid of Object.keys(playerStats.players)) {
          this._dataTracker.setStatus(puuid, 'analysis', 'loaded')
        }
      },
      { fireImmediately: true }
    )

    this._mobx.reaction(
      () => this._og.state.queryStage.phase,
      (phase) => {
        if (phase === 'unavailable') {
          this._dataTracker.clear()
        }
      }
    )

    this._dataTracker.onChanges((changes) => {
      if (!this.settings.enabled) return
      const summary = this._dataTracker.getSummary()
      this._log.info(
        `Data tracking update: ${summary.fullyLoaded}/${summary.totalPlayers} fully loaded, ` +
        `${summary.partiallyLoaded} partial, ${summary.loading} loading, ${summary.errors} errors`
      )
    })
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
        inferredPremadeTeams: this._og.state.inferredPremadeTeams,
        queryPhase: this._og.state.queryStage.phase
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
      if (!this.settings.showItemization)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.ITEMIZATION_HINT)
      if (!this.settings.showObjectiveTiming)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.OBJECTIVE_TIMING)
      if (!this.settings.showPlaystyleAdaptation)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.PLAYSTYLE_ADAPTATION)
      if (!this.settings.showGoldEfficiency)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.GOLD_EFFICIENCY)
      if (!this.settings.showTrueDamageWarning)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.TRUE_DAMAGE_WARNING)
      if (!this.settings.showWinCondition)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.WIN_CONDITION)
      if (!this.settings.showKdaTrend)
        filtered = filtered.filter((a) => a.type !== CoachAdviceType.KDA_TREND)

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

      const schedulerStats = this._engine.getSchedulerStats()
      const teamComparisonSummary = this._engine.getTeamComparisonSummary()

      runInAction(() => {
        this.state.advices = truncated
        this.state.formattedMessages = messages
        this.state.lastGeneratedAt = Date.now()
        this.state.isGenerating = false
        this.state.pipelineInfo = pipelineInfo
        this.state.currentGamePhase = schedulerStats.currentPhase as any
        this.state.schedulerStats = {
          totalQueued: schedulerStats.totalQueued,
          delivered: schedulerStats.delivered,
          avgRelevance: schedulerStats.avgRelevance
        }
        this.state.teamComparisonSummary = teamComparisonSummary
          ? { overallDelta: teamComparisonSummary.overallDelta, confidence: teamComparisonSummary.confidence }
          : null
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

    this._ipc.onCall(CoachAdvisorMain.id, 'getSchedulerStats', () => {
      return this._engine.scheduler.getStats()
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getLoadProgress', () => {
      return this._dataTracker.getLoadProgress()
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getFailedPuuids', () => {
      return this._dataTracker.getFailedPuuids()
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getDataAvailability', () => {
      return {
        summary: this._dataTracker.getSummary(),
        availability: Object.fromEntries(this._dataTracker.getAllAvailability())
      }
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getPlayerCompleteness', (_, puuid: string) => {
      return {
        puuid,
        completeness: this._dataTracker.getCompleteness(puuid),
        availability: this._dataTracker.getAvailability(puuid),
        isReady: this._dataTracker.isReadyForAnalysis(puuid),
        isFullyLoaded: this._dataTracker.isFullyLoaded(puuid)
      }
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getSchedulerStats', () => {
      return this._engine.getSchedulerStats()
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getTeamComparison', () => {
      return this._engine.getTeamComparisonSummary()
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getScheduledAdvices', (_, count?: number) => {
      const scheduled = this._engine.peekScheduledAdvices(count || 6)
      return this._engine.formatAsMessages(scheduled, {
        maxLines: count || 6,
        minPriority: this.settings.minPriority
      })
    })

    this._ipc.onCall(
      CoachAdvisorMain.id,
      'suppressAdviceType',
      (_, type: string) => {
        this._engine.suppressAdviceType(type)
      }
    )

    this._ipc.onCall(
      CoachAdvisorMain.id,
      'unsuppressAdviceType',
      (_, type: string) => {
        this._engine.unsuppressAdviceType(type)
      }
    )

    this._ipc.onCall(CoachAdvisorMain.id, 'getExperimentExport', () => {
      return this._engine.getExperimentExport()
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getTrainingSamples', () => {
      return this._engine.getTrainingSamples()
    })

    this._ipc.onCall(CoachAdvisorMain.id, 'getCaptureStats', () => {
      return this._engine.getCaptureStats()
    })

    this._ipc.onCall(
      CoachAdvisorMain.id,
      'recordFeedback',
      (_, adviceType: string, feedback: string) => {
        this._engine.recordUserFeedback(
          adviceType,
          feedback as 'helpful' | 'not-helpful' | 'dismiss'
        )
      }
    )

    this._ipc.onCall(
      CoachAdvisorMain.id,
      'setGameOutcome',
      (_, sessionId: string, outcome: string) => {
        return this._engine.setGameOutcome(
          sessionId,
          outcome as 'win' | 'loss' | 'unknown'
        )
      }
    )

    this._ipc.onCall(CoachAdvisorMain.id, 'getInferenceStats', () => {
      return this._engine.getInferenceStats()
    })

    this._ipc.onCall(
      CoachAdvisorMain.id,
      'loadInferenceModel',
      async (_, modelPath: string) => {
        return this._engine.loadInferenceModel(modelPath)
      }
    )

    this._ipc.onCall(
      CoachAdvisorMain.id,
      'switchInferenceBackend',
      (_, backend: string) => {
        this._engine.switchInferenceBackend(backend as any)
      }
    )
  }
}
