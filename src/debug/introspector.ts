/**
 * NexusIntrospector — 运行时调试/内省基础设施
 *
 * 这是整个引擎的"神经系统"。upstream只有接口引用，实现是原创的。
 * 功能：
 *   - 分级日志（trace/debug/info/warn/error/checkpoint）
 *   - 注册探针（probe）：任何模块可注册回调，dump时统一调用
 *   - StructWatcher：监控结构体字段变更并记录diff
 *   - 条件断点：当特定条件满足时暂停并dump当前状态
 *   - 环形事件缓冲区：保留最近N个事件供事后分析
 *   - 彩色终端输出（可关闭）
 */

import { IntrospectorEvent, IntrospectorLevel, StructDiff } from '../types'

// ── 颜色工具 ──

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const

const LEVEL_COLORS: Record<IntrospectorLevel, string> = {
  trace: COLORS.gray,
  debug: COLORS.dim,
  info: COLORS.cyan,
  warn: COLORS.yellow,
  error: COLORS.red,
  checkpoint: COLORS.green,
}

const LEVEL_ICONS: Record<IntrospectorLevel, string> = {
  trace: '·',
  debug: '→',
  info: 'ℹ',
  warn: '⚠',
  error: '✗',
  checkpoint: '◆',
}

// ── StructWatcher ──

export class StructWatcher<T extends Record<string, unknown> = Record<string, unknown>> {
  private _name: string
  private _snapshot: T | null = null
  private _diffs: StructDiff[] = []
  private _maxDiffs: number

  constructor(name: string, maxDiffs: number = 200) {
    this._name = name
    this._maxDiffs = maxDiffs
  }

  get name() { return this._name }

  /**
   * 拍摄新快照并与上一次对比。返回本次diff列表。
   * 这是断点调试的核心——你可以在任何关键路径调用它来监控数据变化。
   */
  snap(current: T): StructDiff[] {
    const now = Date.now()
    const newDiffs: StructDiff[] = []

    if (this._snapshot !== null) {
      const allKeys = new Set([
        ...Object.keys(this._snapshot),
        ...Object.keys(current)
      ])

      for (const field of allKeys) {
        const from = this._snapshot[field]
        const to = current[field]
        // 浅比较——对象类型用JSON粗比较
        if (from !== to) {
          const fromStr = typeof from === 'object' ? JSON.stringify(from) : String(from)
          const toStr = typeof to === 'object' ? JSON.stringify(to) : String(to)
          if (fromStr !== toStr) {
            const diff: StructDiff = { field, from, to, timestamp: now }
            newDiffs.push(diff)
            this._diffs.push(diff)
          }
        }
      }

      // 滚动裁剪
      while (this._diffs.length > this._maxDiffs) this._diffs.shift()
    }

    this._snapshot = { ...current }
    return newDiffs
  }

  getDiffs(): StructDiff[] { return [...this._diffs] }
  getLastSnapshot(): T | null { return this._snapshot ? { ...this._snapshot } : null }

  /**
   * 打印最近的diff记录——像git diff一样看数据变化
   */
  printDiffs(count: number = 10): void {
    const recent = this._diffs.slice(-count)
    console.log(`\n${COLORS.magenta}── StructWatcher [${this._name}] last ${recent.length} diffs ──${COLORS.reset}`)
    for (const d of recent) {
      const ts = new Date(d.timestamp).toISOString().slice(11, 23)
      console.log(`  ${COLORS.gray}${ts}${COLORS.reset} ${d.field}: ${COLORS.red}${fmt(d.from)}${COLORS.reset} → ${COLORS.green}${fmt(d.to)}${COLORS.reset}`)
    }
  }

  clear(): void {
    this._diffs = []
    this._snapshot = null
  }
}

function fmt(v: unknown): string {
  if (v === undefined) return '<undefined>'
  if (v === null) return '<null>'
  if (typeof v === 'object') {
    const s = JSON.stringify(v)
    return s.length > 60 ? s.slice(0, 57) + '...' : s
  }
  return String(v)
}

// ── 条件断点 ──

interface ConditionalBreakpoint {
  name: string
  condition: () => boolean
  action: (introspector: NexusIntrospector) => void
  once: boolean
  fired: boolean
}

// ── NexusIntrospector (Singleton) ──

export class NexusIntrospector {
  private static _instance: NexusIntrospector | null = null

  private _events: IntrospectorEvent[] = []
  private _maxEvents: number
  private _probes = new Map<string, () => Record<string, unknown>>()
  private _structWatchers = new Map<string, StructWatcher>()
  private _breakpoints: ConditionalBreakpoint[] = []
  private _enabled: boolean
  private _minLevel: IntrospectorLevel
  private _colorEnabled: boolean

  // 级别权重用于过滤
  private static LEVEL_WEIGHT: Record<IntrospectorLevel, number> = {
    trace: 0, debug: 1, info: 2, warn: 3, error: 4, checkpoint: 5
  }

  constructor(options?: {
    maxEvents?: number
    enabled?: boolean
    minLevel?: IntrospectorLevel
    color?: boolean
  }) {
    this._maxEvents = options?.maxEvents ?? 2000
    this._enabled = options?.enabled ?? true
    this._minLevel = options?.minLevel ?? 'trace'
    this._colorEnabled = options?.color ?? true
  }

  static getInstance(): NexusIntrospector {
    if (!NexusIntrospector._instance) {
      NexusIntrospector._instance = new NexusIntrospector()
    }
    return NexusIntrospector._instance
  }

  static resetInstance(): void {
    NexusIntrospector._instance = null
  }

  // ── 日志方法 ──

  private _log(level: IntrospectorLevel, source: string, message: string, data?: unknown): void {
    if (!this._enabled) return
    if (NexusIntrospector.LEVEL_WEIGHT[level] < NexusIntrospector.LEVEL_WEIGHT[this._minLevel]) return

    const event: IntrospectorEvent = {
      level, source, message, data, timestamp: Date.now()
    }
    this._events.push(event)
    while (this._events.length > this._maxEvents) this._events.shift()

    // 终端输出
    const c = this._colorEnabled ? LEVEL_COLORS[level] : ''
    const r = this._colorEnabled ? COLORS.reset : ''
    const icon = LEVEL_ICONS[level]
    const ts = new Date().toISOString().slice(11, 23)
    const dataStr = data ? ` ${COLORS.gray}${fmt(data)}${r}` : ''
    console.log(`${COLORS.gray}${ts}${r} ${c}${icon} [${source}]${r} ${message}${dataStr}`)

    // 检查条件断点
    this._checkBreakpoints()
  }

  trace(source: string, message: string, data?: unknown): void { this._log('trace', source, message, data) }
  debug(source: string, message: string, data?: unknown): void { this._log('debug', source, message, data) }
  info(source: string, message: string, data?: unknown): void { this._log('info', source, message, data) }
  warn(source: string, message: string, data?: unknown): void { this._log('warn', source, message, data) }
  error(source: string, message: string, data?: unknown): void { this._log('error', source, message, data) }

  checkpoint(source: string, label: string, data?: unknown): void {
    this._log('checkpoint', source, `⏱ ${label}`, data)
  }

  // ── 探针注册 ──

  registerProbe(module: string, name: string, getter: () => Record<string, unknown>): void {
    this._probes.set(`${module}:${name}`, getter)
  }

  getProbeState(fullName: string): Record<string, unknown> | null {
    const fn = this._probes.get(fullName)
    if (!fn) return null
    try { return fn() } catch { return null }
  }

  getAllProbeStates(): Record<string, Record<string, unknown> | null> {
    const result: Record<string, Record<string, unknown> | null> = {}
    for (const [name] of this._probes) {
      result[name] = this.getProbeState(name)
    }
    return result
  }

  // ── StructWatcher管理 ──

  createStructWatcher<T extends Record<string, unknown>>(name: string): StructWatcher<T> {
    const watcher = new StructWatcher<T>(name)
    this._structWatchers.set(name, watcher as StructWatcher)
    return watcher
  }

  getStructWatcher(name: string): StructWatcher | undefined {
    return this._structWatchers.get(name)
  }

  // ── 条件断点 ──

  addBreakpoint(name: string, condition: () => boolean, action: (i: NexusIntrospector) => void, once = false): void {
    this._breakpoints.push({ name, condition, action, once, fired: false })
    this.debug('introspector', `Breakpoint registered: "${name}"`)
  }

  private _checkBreakpoints(): void {
    for (const bp of this._breakpoints) {
      if (bp.once && bp.fired) continue
      try {
        if (bp.condition()) {
          this.info('introspector', `🔴 Breakpoint hit: "${bp.name}"`)
          bp.fired = true
          bp.action(this)
        }
      } catch { /* breakpoint condition error, skip */ }
    }
  }

  // ── 事件查询 ──

  getEvents(filter?: { level?: IntrospectorLevel; source?: string; limit?: number }): IntrospectorEvent[] {
    let result = [...this._events]
    if (filter?.level) result = result.filter(e => e.level === filter.level)
    if (filter?.source) result = result.filter(e => e.source === filter.source)
    if (filter?.limit) result = result.slice(-filter.limit)
    return result
  }

  getCheckpoints(): IntrospectorEvent[] {
    return this._events.filter(e => e.level === 'checkpoint')
  }

  // ── 报告输出 ──

  printReport(): void {
    const M = COLORS.magenta, R = COLORS.reset, G = COLORS.green, Y = COLORS.yellow

    console.log(`\n${M}╔══ Introspector Report ════════════════════════════════╗${R}`)

    // 事件统计
    const counts: Record<string, number> = {}
    for (const e of this._events) counts[e.level] = (counts[e.level] || 0) + 1
    console.log(`${M}║${R} Events: ${this._events.length}/${this._maxEvents}`)
    for (const [level, count] of Object.entries(counts)) {
      const c = LEVEL_COLORS[level as IntrospectorLevel] || ''
      console.log(`${M}║${R}   ${c}${level}: ${count}${R}`)
    }

    // 探针
    console.log(`${M}║${R} Probes: ${this._probes.size}`)
    for (const [name, fn] of this._probes) {
      try {
        const state = fn()
        const keys = Object.keys(state)
        console.log(`${M}║${R}   ${G}${name}${R} (${keys.length} fields)`)
      } catch {
        console.log(`${M}║${R}   ${Y}${name}${R} <error>`)
      }
    }

    // StructWatcher
    console.log(`${M}║${R} StructWatchers: ${this._structWatchers.size}`)
    for (const [name, w] of this._structWatchers) {
      console.log(`${M}║${R}   ${name}: ${w.getDiffs().length} diffs`)
    }

    // 断点
    console.log(`${M}║${R} Breakpoints: ${this._breakpoints.length}`)
    for (const bp of this._breakpoints) {
      const status = bp.fired ? '🔴 FIRED' : '⚪ armed'
      console.log(`${M}║${R}   ${bp.name}: ${status}`)
    }

    console.log(`${M}╚══════════════════════════════════════════════════════╝${R}`)
  }

  /**
   * 全量dump——在"断点"时调用，输出所有探针+最近事件+struct diff
   * 这是最核心的调试手段，相当于 GDB 的 print all locals
   */
  dumpFull(): void {
    console.log('\n' + '='.repeat(60))
    console.log('  NEXUS-ENGINE FULL STATE DUMP (enhanced)')
    console.log('  ' + new Date().toISOString())
    console.log('  Event buffer: ' + this._events.length + '/' + this._maxEvents)
    console.log('  Active probes: ' + this._probes.size)
    console.log('  Struct watchers: ' + this._structWatchers.size)
    console.log('  Breakpoints: ' + this._breakpoints.length + ' (' + this._breakpoints.filter(b => b.fired).length + ' fired)')
    console.log('='.repeat(60))

    // 所有探针状态
    console.log('\n── Probe States ──')
    for (const [name, fn] of this._probes) {
      console.log(`\n  [${name}]`)
      try {
        const state = fn()
        for (const [k, v] of Object.entries(state)) {
          console.log(`    ${k}: ${JSON.stringify(v, null, 0)}`)
        }
      } catch (e) {
        console.log(`    <error: ${e}>`)
      }
    }

    // 最近50个事件
    console.log('\n── Recent Events (last 50) ──')
    const recent = this._events.slice(-50)
    for (const e of recent) {
      const ts = new Date(e.timestamp).toISOString().slice(11, 23)
      console.log(`  ${ts} [${e.level}] ${e.source}: ${e.message}`)
    }

    // StructWatcher diffs
    console.log('\n── Struct Watcher Diffs ──')
    for (const [, w] of this._structWatchers) {
      w.printDiffs(5)
    }

    console.log('\n' + '='.repeat(60))
  }

  // ── 控制 ──

  setEnabled(enabled: boolean): void { this._enabled = enabled }
  setMinLevel(level: IntrospectorLevel): void { this._minLevel = level }
  setColorEnabled(enabled: boolean): void { this._colorEnabled = enabled }

  clear(): void {
    this._events = []
    this._probes.clear()
    this._structWatchers.clear()
    this._breakpoints = []
  }
}

// ── 全局便捷实例 ──

export const introspector = NexusIntrospector.getInstance()
