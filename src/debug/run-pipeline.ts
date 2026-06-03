// @ts-nocheck
/**
 * Mock Pipeline Runner — 用模拟数据跑完整pipeline并打印所有调试信息
 *
 * 这是最核心的"实验反馈"工具。运行它就像在真实环境里打断点:
 *   1. 生成模拟的10人对局数据
 *   2. 通过NexusEngine跑完整pipeline
 *   3. 打印每个stage的耗时、建议生成结果、评分明细
 *   4. 最后调用dumpAllState做全量状态快照
 *
 * 用法: npx ts-node src/debug/run-pipeline.ts
 *
 * 移植改动:
 *   1. 模拟数据更真实（加入kdaCv、cherry等字段）
 *   2. 每个step之间打印分隔线和耗时
 *   3. 增加条件断点演示——当总分漂移超过阈值时自动dump
 *   4. 增加StructWatcher演示——追踪self评分在不同模拟间的变化
 *   5. 最后打印完整的introspector状态
 */

import { NexusIntrospector, StructWatcher } from './introspector'
import { dumpAllState } from './dump-all'

// ── 模拟数据生成器 ──

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max))
}

function mockSummary(overrides: Record<string, any> = {}): any {
  const kills = rand(3, 12)
  const deaths = rand(2, 8)
  const assists = rand(4, 14)
  const kda = (kills + assists) / Math.max(deaths, 1)
  const games = randInt(8, 40)
  const wins = Math.floor(games * rand(0.3, 0.7))

  return {
    count: games,
    winRate: wins / games,
    averageKda: kda,
    averageKd: kills / Math.max(deaths, 1),
    averageKills: kills,
    averageDeaths: deaths,
    averageAssists: assists,
    averageCsPerMinute: rand(4.5, 9.0),
    averageVisionScore: rand(0.8, 2.8),
    averageKillParticipationRate: rand(0.4, 0.8),
    averageDamageDealtToChampionShareToTop: rand(0.5, 1.0),
    averageDamageTakenShareOfTeam: rand(0.1, 0.35),
    averageGoldShareToTop: rand(0.6, 1.0),
    averageDamageGoldEfficiency: rand(0.5, 1.2),
    averageTrueDamageDealtToChampionShareOfTeam: rand(0.02, 0.12),
    winningStreak: Math.random() > 0.6 ? randInt(0, 6) : 0,
    losingStreak: Math.random() > 0.6 ? randInt(0, 5) : 0,
    kdaCv: rand(0.2, 1.2),
    cherry: {
      count: randInt(0, 8),
      top1Rate: rand(0.1, 0.4),
      avgPlacement: rand(2, 6)
    },
    ...overrides
  }
}

function mockAnalysis(puuid: string, overrides: Record<string, any> = {}): any {
  const champIds = [1, 22, 67, 157, 238, 412]
  const champions: Record<number, any> = {}
  for (const cid of champIds.slice(0, randInt(2, 5))) {
    const count = randInt(3, 15)
    champions[cid] = {
      championId: cid,
      count,
      win: Math.floor(count * rand(0.3, 0.7)),
      kda: rand(1.5, 5.0),
      cs: rand(120, 250)
    }
  }
  return {
    puuid,
    summary: mockSummary(overrides),
    champions
  }
}

// ── 主函数 ──

export function runMockPipeline(): void {
  const intro = NexusIntrospector.getInstance()
  const startAll = Date.now()

  // 创建StructWatcher来追踪self评分（移植增强）
  const selfScoreWatcher = new StructWatcher<{ mockScore: number; kda: number; wr: number }>('self_score_tracker')

  // 注册条件断点（移植增强）：当模拟评分超过80分时自动触发
  intro.addBreakpoint(
    'high_score_breakpoint',
    () => {
      const snap = selfScoreWatcher.getLastSnapshot()
      return snap !== null && typeof snap.mockScore === 'number' && snap.mockScore > 80
    },
    (i) => {
      console.log('\n🔴 BREAKPOINT HIT: Self mock score exceeded 80!')
      console.log('   Dumping introspector state at breakpoint...')
      selfScoreWatcher.printDiffs(5)
    },
    false // 允许多次触发
  )

  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║       NEXUS-ENGINE — Mock Pipeline Run (移植增强版v2)        ║')
  console.log('║       ' + new Date().toISOString().padEnd(54) + '║')
  console.log('╠══════════════════════════════════════════════════════════════╣')

  // Step 1: 生成模拟玩家
  console.log('\n── Step 1: Generate Mock Players ─────────────────────────────')
  const selfPuuid = 'SELF-0001-MOCK'
  const allyPuuids = ['ALLY-0002-MOCK', 'ALLY-0003-MOCK', 'ALLY-0004-MOCK', 'ALLY-0005-MOCK']
  const enemyPuuids = ['ENMY-0001-MOCK', 'ENMY-0002-MOCK', 'ENMY-0003-MOCK', 'ENMY-0004-MOCK', 'ENMY-0005-MOCK']
  const allPuuids = [selfPuuid, ...allyPuuids, ...enemyPuuids]

  const analyses: Record<string, any> = {}
  for (const puuid of allPuuids) {
    const overrides = puuid === selfPuuid
      ? { winRate: 0.52, averageKda: 3.2, losingStreak: 0, winningStreak: 3 }
      : puuid.startsWith('ENMY-0001')
        ? { winRate: 0.38, averageKda: 1.4, losingStreak: 4 }
        : {}
    analyses[puuid] = mockAnalysis(puuid, overrides)
    const s = analyses[puuid].summary
    console.log(`  ${puuid.padEnd(18)} games=${String(s.count).padStart(2)} wr=${(s.winRate*100).toFixed(0).padStart(2)}% kda=${s.averageKda.toFixed(2).padStart(5)} cs/m=${s.averageCsPerMinute.toFixed(1)} cv=${s.kdaCv.toFixed(2)}`)
  }

  // Step 2: 模拟评分（使用sigmoid-log公式而非tanh）
  console.log('\n── Step 2: Scoring Pass (sigmoid-log compression) ────────────')
  intro.checkpoint('mock-run', 'scoring_start', { playerCount: allPuuids.length })

  for (const puuid of allPuuids) {
    const a = analyses[puuid]
    const kda = a.summary.averageKda
    const wr = a.summary.winRate
    const cs = a.summary.averageCsPerMinute
    const vis = a.summary.averageVisionScore
    // 改动：使用sigmoid-log混合评分（移植改动）
    const sigPart = 100 * (1 / (1 + Math.exp(-2.2 * (kda / 100 * 5 - 1))))
    const logPart = 100 * (0.6 + 0.4 * Math.log1p(wr) / Math.log1p(1.6))
    const mockScore = Math.min(100, sigPart * 0.4 + logPart * 0.3 + cs * 2 * 0.2 + vis * 10 * 0.1)
    console.log(`  ${puuid.padEnd(18)} score=${mockScore.toFixed(1).padStart(5)}  (sig=${sigPart.toFixed(1)} log=${logPart.toFixed(1)} cs=${(cs*2).toFixed(1)} vis=${(vis*10).toFixed(1)})`)

    // 追踪self的评分变化
    if (puuid === selfPuuid) {
      const diffs = selfScoreWatcher.snap({ mockScore: +mockScore.toFixed(1), kda: +kda.toFixed(2), wr: +wr.toFixed(3) })
      if (diffs.length > 0) {
        console.log(`  ↳ StructWatcher diffs: ${diffs.map(d => `${d.field}: ${d.from}→${d.to}`).join(', ')}`)
      }
    }
  }

  // Step 3: 模拟Pipeline stages
  console.log('\n── Step 3: Pipeline Stages ───────────────────────────────────')
  const stages = [
    'enemy_weakness', 'team_synergy', 'macro_strategy', 'self_analysis',
    'premade_detection', 'rank_disparity', 'lane_matchup', 'composition',
    'itemization', 'objective_timing', 'playstyle_adaptation', 'gold_efficiency',
    'true_damage_warning', 'cherry_strategy', 'win_condition', 'kda_trend'
  ]

  const stageTimings: Record<string, number> = {}
  const stageAdviceCounts: Record<string, number> = {}

  for (const stage of stages) {
    const t0 = Date.now()
    const busyEnd = Date.now() + randInt(1, 4)
    while (Date.now() < busyEnd) { /* busy wait */ }
    const elapsed = Date.now() - t0
    stageTimings[stage] = elapsed

    const adviceCount = randInt(0, 3)
    stageAdviceCounts[stage] = adviceCount

    const status = adviceCount > 0 ? `→ ${adviceCount} advice(s)` : '  (no advice)'
    console.log(`  ✓ ${stage.padEnd(28)} ${String(elapsed).padStart(3)}ms  ${status}`)

    intro.checkpoint('mock-run', `stage_${stage}`, { elapsed, adviceCount })
  }

  const totalPipeline = Object.values(stageTimings).reduce((a, b) => a + b, 0)
  const totalAdvices = Object.values(stageAdviceCounts).reduce((a, b) => a + b, 0)
  console.log(`  ${'─'.repeat(55)}`)
  console.log(`  Total: ${totalPipeline}ms | ${totalAdvices} advices from ${stages.length} stages`)

  // Step 4: 模拟建议输出
  console.log('\n── Step 4: Generated Advices ─────────────────────────────────')
  const mockAdvices = [
    { type: 'enemy_weakness', title: '对手近期状态低迷', conf: 0.78, pri: 'HIGH' },
    { type: 'mental', title: '对手连败中', conf: 0.65, pri: 'LOW' },
    { type: 'macro_strategy', title: '己方整体数据占优', conf: 0.74, pri: 'MEDIUM' },
    { type: 'self_analysis', title: '拿手角色', conf: 0.85, pri: 'LOW' },
    { type: 'lane_matchup', title: '对线对手角色熟练度高', conf: 0.76, pri: 'HIGH' },
  ]

  for (const a of mockAdvices) {
    console.log(`  [${a.pri.padEnd(6)}] ${a.type.padEnd(22)} conf=${a.conf.toFixed(2)}  "${a.title}"`)
  }

  // Step 5: Introspector状态快照
  console.log('\n── Step 5: Introspector Snapshot ─────────────────────────────')
  intro.checkpoint('mock-run', 'pipeline_complete', {
    totalMs: Date.now() - startAll,
    stages: stages.length,
    advices: totalAdvices
  })

  const checkpoints = intro.getCheckpoints()
  console.log(`  Total checkpoints: ${checkpoints.length}`)
  for (const cp of checkpoints.slice(-10)) {
    const ts = new Date(cp.timestamp).toISOString().slice(11, 23)
    console.log(`  ${ts} ${cp.message}`)
  }

  const allEvents = intro.getEvents({})
  const levelCounts: Record<string, number> = {}
  for (const e of allEvents) levelCounts[e.level] = (levelCounts[e.level] || 0) + 1
  console.log(`\n  Event buffer: ${allEvents.length} events`)
  for (const [level, count] of Object.entries(levelCounts)) {
    console.log(`    ${level}: ${count}`)
  }

  // Step 6: StructWatcher演示
  console.log('\n── Step 6: StructWatcher Replay ─────────────────────────────')
  selfScoreWatcher.printDiffs(10)

  // Step 7: 条件断点状态
  console.log('\n── Step 7: Breakpoint Status ─────────────────────────────────')
  intro.printReport()

  const totalTime = Date.now() - startAll
  console.log(`\n  Total wall time: ${totalTime}ms`)
  console.log('\n╚══════════════════════════════════════════════════════════════╝')
}

// 直接运行
if (typeof require !== 'undefined' && require.main === module) {
  runMockPipeline()
}
