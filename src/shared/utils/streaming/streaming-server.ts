import type { PantheonAdvice } from '../engine'
import type { GamePhase } from '../scheduler'
import type { CaptureEvent, FeatureVector, TrainingSample } from '../capture/experiment-capture'
import type { PrivacyScrubber } from '../capture/privacy-scrubber'
import type { ReplayAnalysisReport } from '../replay'
import type { InferenceResult } from '../inference'
import type { ExperimentSnapshot } from '../abtest'

export type StreamMessageType =
  | 'advice-generated'
  | 'capture-event'
  | 'feature-snapshot'
  | 'training-sample'
  | 'phase-transition'
  | 'replay-analyzed'
  | 'inference-result'
  | 'feedback'
  | 'experiment-update'
  | 'heartbeat'
  | 'welcome'
  | 'error'
  | 'stats'

export interface StreamMessage {
  type: StreamMessageType
  timestamp: number
  sessionId: string
  payload: unknown
}

export interface StreamSubscription {
  types: StreamMessageType[] | 'all'
  minPriority?: number
  gamePhaseFilter?: GamePhase[]
}

export interface StreamClientInfo {
  id: string
  connectedAt: number
  lastPingAt: number
  subscription: StreamSubscription
  messagesSent: number
  bytesTransferred: number
}

export interface StreamServerConfig {
  port: number
  host: string
  heartbeatIntervalMs: number
  clientTimeoutMs: number
  maxClients: number
  maxMessageQueueSize: number
  enableBroadcastThrottle: boolean
  throttleIntervalMs: number
}

const DEFAULT_CONFIG: StreamServerConfig = {
  port: 29876,
  host: '127.0.0.1',
  heartbeatIntervalMs: 30000,
  clientTimeoutMs: 90000,
  maxClients: 10,
  maxMessageQueueSize: 200,
  enableBroadcastThrottle: true,
  throttleIntervalMs: 100
}

interface ConnectedClient {
  ws: any
  info: StreamClientInfo
}

function generateClientId(): string {
  return `client-${Date.now()}-${(Math.random() * 0xffff | 0).toString(16)}`
}

function matchesSubscription(
  msg: StreamMessage,
  sub: StreamSubscription
): boolean {
  if (sub.types !== 'all' && !sub.types.includes(msg.type)) return false
  if (sub.gamePhaseFilter && sub.gamePhaseFilter.length > 0) {
    const phase = (msg.payload as any)?.gamePhase || (msg.payload as any)?.phase
    if (phase && !sub.gamePhaseFilter.includes(phase)) return false
  }
  return true
}

export class PantheonStreamServer {
  private _config: StreamServerConfig
  private _wss: any = null
  private _clients = new Map<string, ConnectedClient>()
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _isRunning = false
  private _sessionId = ''
  private _totalMessages = 0
  private _totalBytes = 0
  private _messageQueue: StreamMessage[] = []
  private _throttleTimer: ReturnType<typeof setTimeout> | null = null
  private _onStartListeners = new Set<(port: number) => void>()
  private _onClientListeners = new Set<(clientId: string, action: 'connect' | 'disconnect') => void>()
  private _privacyScrubber: PrivacyScrubber | null = null

  constructor(config?: Partial<StreamServerConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
  }

  setPrivacyScrubber(scrubber: PrivacyScrubber | null): void {
    this._privacyScrubber = scrubber
  }

  async start(sessionId?: string): Promise<boolean> {
    if (this._isRunning) return false
    this._sessionId = sessionId || `stream-${Date.now()}`

    try {
      const WebSocket = require('ws')
      this._wss = new WebSocket.Server({
        port: this._config.port,
        host: this._config.host
      })

      this._wss.on('connection', (ws: any, req: any) => {
        if (this._clients.size >= this._config.maxClients) {
          ws.close(1013, 'Max clients reached')
          return
        }

        const clientId = generateClientId()
        const client: ConnectedClient = {
          ws,
          info: {
            id: clientId,
            connectedAt: Date.now(),
            lastPingAt: Date.now(),
            subscription: { types: 'all' },
            messagesSent: 0,
            bytesTransferred: 0
          }
        }
        this._clients.set(clientId, client)

        this._sendToClient(client, {
          type: 'welcome',
          timestamp: Date.now(),
          sessionId: this._sessionId,
          payload: {
            clientId,
            serverConfig: {
              heartbeatIntervalMs: this._config.heartbeatIntervalMs,
              maxMessageQueueSize: this._config.maxMessageQueueSize
            }
          }
        })

        for (const listener of this._onClientListeners) {
          try { listener(clientId, 'connect') } catch (_) {}
        }

        ws.on('message', (data: any) => {
          try {
            const msg = JSON.parse(data.toString())
            this._handleClientMessage(clientId, msg)
          } catch (_) {}
        })

        ws.on('pong', () => {
          client.info.lastPingAt = Date.now()
        })

        ws.on('close', () => {
          this._clients.delete(clientId)
          for (const listener of this._onClientListeners) {
            try { listener(clientId, 'disconnect') } catch (_) {}
          }
        })

        ws.on('error', () => {
          this._clients.delete(clientId)
        })
      })

      this._startHeartbeat()
      this._isRunning = true

      for (const listener of this._onStartListeners) {
        try { listener(this._config.port) } catch (_) {}
      }

      return true
    } catch (error) {
      console.error('PantheonStreamServer: failed to start', error)
      return false
    }
  }

  stop(): void {
    if (!this._isRunning) return

    this._stopHeartbeat()

    for (const [, client] of this._clients) {
      try { client.ws.close(1001, 'Server shutting down') } catch (_) {}
    }
    this._clients.clear()

    if (this._wss) {
      try { this._wss.close() } catch (_) {}
      this._wss = null
    }

    if (this._throttleTimer) {
      clearTimeout(this._throttleTimer)
      this._throttleTimer = null
    }

    this._messageQueue = []
    this._isRunning = false
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  get clientCount(): number {
    return this._clients.size
  }

  get stats(): {
    isRunning: boolean
    port: number
    clientCount: number
    totalMessages: number
    totalBytes: number
    queueSize: number
    sessionId: string
  } {
    return {
      isRunning: this._isRunning,
      port: this._config.port,
      clientCount: this._clients.size,
      totalMessages: this._totalMessages,
      totalBytes: this._totalBytes,
      queueSize: this._messageQueue.length,
      sessionId: this._sessionId
    }
  }

  getClients(): StreamClientInfo[] {
    return Array.from(this._clients.values()).map(c => ({ ...c.info }))
  }

  broadcastAdvices(advices: PantheonAdvice[], gamePhase: GamePhase): void {
    this._enqueue({
      type: 'advice-generated',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: { advices, gamePhase, count: advices.length }
    })
  }

  broadcastCaptureEvent(event: CaptureEvent): void {
    const scrubbedEvent = this._privacyScrubber
      ? this._privacyScrubber.scrubCaptureEvent(event)
      : event
    this._enqueue({
      type: 'capture-event',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: scrubbedEvent
    })
  }

  broadcastFeatureSnapshot(vector: FeatureVector, gamePhase: GamePhase): void {
    this._enqueue({
      type: 'feature-snapshot',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: { vector, gamePhase }
    })
  }

  broadcastTrainingSample(sample: TrainingSample): void {
    const scrubbedSample = this._privacyScrubber
      ? this._privacyScrubber.scrubTrainingSample(sample)
      : sample
    this._enqueue({
      type: 'training-sample',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: scrubbedSample
    })
  }

  broadcastPhaseTransition(from: GamePhase, to: GamePhase): void {
    this._enqueue({
      type: 'phase-transition',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: { from, to }
    })
  }

  setSessionId(sessionId: string): void {
    this._sessionId = sessionId
  }

  broadcastFeedback(adviceType: string, feedback: string): void {
    this._enqueue({
      type: 'feedback',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: { adviceType, feedback }
    })
  }

  broadcastReplayAnalysis(report: ReplayAnalysisReport): void {
    this._enqueue({
      type: 'replay-analyzed',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: {
        gameId: report.gameId,
        outcome: report.outcome.outcome,
        overallAccuracy: report.overallAccuracy,
        backfilledSamples: report.backfilledSamples,
        adviceAccuracyCount: report.adviceAccuracy.length,
        performanceDelta: report.performanceDelta
      }
    })
  }

  broadcastInferenceResult(result: InferenceResult): void {
    this._enqueue({
      type: 'inference-result',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: {
        modelId: result.modelId,
        latencyMs: result.latencyMs,
        predictionCount: result.predictions.length,
        topPrediction: result.predictions[0] || null
      }
    })
  }

  broadcastExperimentUpdate(snapshot: ExperimentSnapshot): void {
    this._enqueue({
      type: 'experiment-update',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: {
        experimentId: snapshot.experimentId,
        totalSessions: snapshot.totalSessions,
        durationMs: snapshot.durationMs,
        hasComparison: snapshot.comparisonResult !== null,
        recommendation: snapshot.comparisonResult?.recommendation || null
      }
    })
  }

  broadcastStats(stats: Record<string, unknown>): void {
    this._enqueue({
      type: 'stats',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      payload: stats
    })
  }

  onStart(listener: (port: number) => void): () => void {
    this._onStartListeners.add(listener)
    return () => { this._onStartListeners.delete(listener) }
  }

  onClient(listener: (clientId: string, action: 'connect' | 'disconnect') => void): () => void {
    this._onClientListeners.add(listener)
    return () => { this._onClientListeners.delete(listener) }
  }

  private _enqueue(msg: StreamMessage): void {
    if (!this._isRunning || this._clients.size === 0) return

    if (this._messageQueue.length >= this._config.maxMessageQueueSize) {
      this._messageQueue.shift()
    }
    this._messageQueue.push(msg)

    if (this._config.enableBroadcastThrottle) {
      if (!this._throttleTimer) {
        this._throttleTimer = setTimeout(() => {
          this._throttleTimer = null
          this._flushQueue()
        }, this._config.throttleIntervalMs)
      }
    } else {
      this._flushQueue()
    }
  }

  private _flushQueue(): void {
    const messages = this._messageQueue.splice(0)
    for (const msg of messages) {
      this._broadcast(msg)
    }
  }

  private _broadcast(msg: StreamMessage): void {
    const json = JSON.stringify(msg)
    const bytes = Buffer.byteLength(json, 'utf-8')

    for (const [, client] of this._clients) {
      if (client.ws.readyState !== 1) continue
      if (!matchesSubscription(msg, client.info.subscription)) continue

      try {
        client.ws.send(json)
        client.info.messagesSent++
        client.info.bytesTransferred += bytes
        this._totalMessages++
        this._totalBytes += bytes
      } catch (_) {}
    }
  }

  private _sendToClient(client: ConnectedClient, msg: StreamMessage): void {
    if (client.ws.readyState !== 1) return
    try {
      const json = JSON.stringify(msg)
      client.ws.send(json)
      client.info.messagesSent++
      client.info.bytesTransferred += Buffer.byteLength(json, 'utf-8')
    } catch (_) {}
  }

  private _handleClientMessage(
    clientId: string,
    msg: { type: string; payload?: unknown }
  ): void {
    const client = this._clients.get(clientId)
    if (!client) return

    switch (msg.type) {
      case 'subscribe': {
        const sub = msg.payload as StreamSubscription
        if (sub) {
          client.info.subscription = {
            types: sub.types || 'all',
            minPriority: sub.minPriority,
            gamePhaseFilter: sub.gamePhaseFilter
          }
        }
        break
      }
      case 'ping':
        client.info.lastPingAt = Date.now()
        this._sendToClient(client, {
          type: 'heartbeat',
          timestamp: Date.now(),
          sessionId: this._sessionId,
          payload: { pong: true }
        })
        break
      case 'get-stats':
        this._sendToClient(client, {
          type: 'stats',
          timestamp: Date.now(),
          sessionId: this._sessionId,
          payload: this.stats
        })
        break
    }
  }

  private _startHeartbeat(): void {
    if (this._heartbeatTimer) return
    this._heartbeatTimer = setInterval(() => {
      const now = Date.now()
      const stale: string[] = []

      for (const [id, client] of this._clients) {
        if (now - client.info.lastPingAt > this._config.clientTimeoutMs) {
          stale.push(id)
          continue
        }
        try { client.ws.ping() } catch (_) {}
      }

      for (const id of stale) {
        const client = this._clients.get(id)
        if (client) {
          try { client.ws.close(1000, 'Heartbeat timeout') } catch (_) {}
          this._clients.delete(id)
          for (const listener of this._onClientListeners) {
            try { listener(id, 'disconnect') } catch (_) {}
          }
        }
      }
    }, this._config.heartbeatIntervalMs)
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
  }

  dispose(): void {
    this.stop()
    this._onStartListeners.clear()
    this._onClientListeners.clear()
  }
}

export function createStreamServer(config?: Partial<StreamServerConfig>): PantheonStreamServer {
  return new PantheonStreamServer(config)
}
