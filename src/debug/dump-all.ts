// @ts-nocheck
/**
 * 全量状态dump — 在任何时刻调用打印引擎所有内部状态
 *
 * 用法:
 *   import { dumpAllState } from './debug/dump-all'
 *   dumpAllState()   // 在你想要"断点"的地方调用
 *
 * 或命令行: npx ts-node src/debug/dump-all.ts
 *
 * 移植改动: 使用本地introspector实现而非upstream的stub
 */

import { NexusIntrospector } from './introspector'

export function dumpAllState(): void {
  const intro = NexusIntrospector.getInstance()

  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║         NEXUS-ENGINE — FULL STATE DUMP              ║')
  console.log('║         ' + new Date().toISOString().padEnd(44) + '║')
  console.log('╠══════════════════════════════════════════════════════╣')

  // 1. 完整introspector报告
  intro.printReport()

  // 2. 所有探针的详细状态
  console.log('\n── Registered Probe States ──────────────────────────────')
  const states = intro.getAllProbeStates()
  for (const [name, state] of Object.entries(states)) {
    console.log(`\n  [${name}]`)
    if (state) {
      for (const [k, v] of Object.entries(state)) {
        const repr = JSON.stringify(v)
        console.log(`    ${k}: ${repr && repr.length > 100 ? repr.slice(0, 97) + '...' : repr}`)
      }
    } else {
      console.log('    <probe returned null>')
    }
  }

  // 3. 最近checkpoint事件——这是最重要的调试信息
  console.log('\n── Recent Checkpoints (last 30) ─────────────────────────')
  const checkpoints = intro.getCheckpoints().slice(-30)
  for (const cp of checkpoints) {
    const ts = new Date(cp.timestamp).toISOString().slice(11, 23)
    console.log(`  ${ts} [${cp.source}] ${cp.message}`)
    if (cp.data) {
      const dataStr = JSON.stringify(cp.data)
      console.log(`    ${dataStr.length > 120 ? dataStr.slice(0, 117) + '...' : dataStr}`)
    }
  }

  // 4. 事件分布统计
  console.log('\n── Event Distribution ───────────────────────────────────')
  const events = intro.getEvents({})
  const typeCounts: Record<string, number> = {}
  for (const evt of events) {
    const key = `${evt.level}:${evt.source}`
    typeCounts[key] = (typeCounts[key] || 0) + 1
  }
  for (const [key, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${key.padEnd(40)} ${count}`)
  }
  console.log(`  Total events in buffer: ${events.length}`)

  console.log('\n╚══════════════════════════════════════════════════════╝')
}

// 直接运行
if (typeof require !== 'undefined' && require.main === module) {
  dumpAllState()
}
