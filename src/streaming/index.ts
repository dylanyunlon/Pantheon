/**
 * 流媒体广播服务 — 实时推送建议到订阅端
 *
 * 来源：原项目 src/shared/utils/streaming/streaming-server.ts
 * 改动（~20%）：
 *   1. 移除对ws模块的直接依赖，改为事件发射+监听模式（可适配任意传输层）
 *   2. 增加消息追踪环形缓冲
 *   3. 广播统计增加消息类型分布
 *   4. 全程introspector探针
 */

import type { Advice } from '../types'
import { introspector } from '../debug/introspector'

const MODULE = 'streaming'

export interface StreamMessage {
  type: 'advice' | 'phase-change' | 'histogram' | 'comparison' | 'replay' | 'heartbeat'
  timestamp: number
  sessionId: string
  payload: unknown
}

export interface StreamServerConfig {
  maxMessageHistory: number
  heartbeatIntervalMs: number
  enableMessageTrace: boolean
}

const DEFAULT_CONFIG: StreamServerConfig = {
  maxMessageHistory: 200,
  heartbeatIntervalMs: 30_000,
  enableMessageTrace: true
}

type StreamListener = (message: StreamMessage) => void

export class NexusStreamServer {
  private _config: StreamServerConfig
  private _listeners: StreamListener[] = []
  private _isRunning = false
  private _sessionId = ''
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _messageHistory: StreamMessage[] = []
  private _stats = {
    totalBroadcasts: 0,
    totalListeners: 0,
    typeDistribution: {} as Record<string, number>
  }

  constructor(config?: Partial<StreamServerConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }

    introspector.registerProbe(MODULE, 'stream_state', () => ({
      isRunning: this._isRunning,
      sessionId: this._sessionId,
      listenerCount: this._listeners.length,
      messageHistorySize: this._messageHistory.length,
      ...this._stats
    }))
  }

  get isRunning(): boolean { return this._isRunning }
  get stats() { return { ...this._stats, listenerCount: this._listeners.length } }

  start(sessionId: string): boolean {
    if (this._isRunning) return false
    this._isRunning = true
    this._sessionId = sessionId
    this._messageHistory = []

    if (this._config.heartbeatIntervalMs > 0) {
      this._heartbeatTimer = setInterval(() => {
        this._broadcast({
          type: 'heartbeat',
          timestamp: Date.now(),
          sessionId: this._sessionId,
          payload: { listenerCount: this._listeners.length }
        })
      }, this._config.heartbeatIntervalMs)
    }

    introspector.info(MODULE, 'Stream server started', { sessionId })
    return true
  }

  stop(): void {
    this._isRunning = false
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
    introspector.info(MODULE, 'Stream server stopped', {
      totalBroadcasts: this._stats.totalBroadcasts
    })
  }

  /**
   * 注册监听器
   */
  subscribe(listener: StreamListener): () => void {
    this._listeners.push(listener)
    this._stats.totalListeners++
    return () => {
      const idx = this._listeners.indexOf(listener)
      if (idx >= 0) this._listeners.splice(idx, 1)
    }
  }

  broadcastAdvices(advices: Advice[]): void {
    if (!this._isRunning) return
    this._broadcast({
      type: 'advice',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: {
        count: advices.length,
        types: advices.map(a => a.type),
        priorities: advices.map(a => a.priority)
      }
    })
  }

  broadcastPhaseChange(from: string, to: string): void {
    if (!this._isRunning) return
    this._broadcast({
      type: 'phase-change',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: { from, to }
    })
  }

  broadcastHistogram(histogram: unknown): void {
    if (!this._isRunning) return
    this._broadcast({
      type: 'histogram',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: histogram
    })
  }

  broadcastReplayAnalysis(report: unknown): void {
    if (!this._isRunning) return
    this._broadcast({
      type: 'replay',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: report
    })
  }

  getMessageHistory(): StreamMessage[] {
    return [...this._messageHistory]
  }

  dispose(): void {
    this.stop()
    this._listeners = []
    this._messageHistory = []
  }

  private _broadcast(message: StreamMessage): void {
    this._stats.totalBroadcasts++
    this._stats.typeDistribution[message.type] =
      (this._stats.typeDistribution[message.type] || 0) + 1

    if (this._config.enableMessageTrace) {
      this._messageHistory.push(message)
      if (this._messageHistory.length > this._config.maxMessageHistory) {
        this._messageHistory.shift()
      }
    }

    for (const listener of this._listeners) {
      try { listener(message) } catch (_) {}
    }

    introspector.trace(MODULE, `Broadcast ${message.type}`, {
      listeners: this._listeners.length
    })
  }
}

export function createStreamServer(config?: Partial<StreamServerConfig>): NexusStreamServer {
  return new NexusStreamServer(config)
}
