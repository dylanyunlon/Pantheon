import { describe, it, expect, beforeEach } from 'vitest'
import { ExperimentManager, createExperimentManager } from './experiment-manager'

describe('ExperimentManager', () => {
  let mgr: ExperimentManager

  beforeEach(() => {
    mgr = createExperimentManager()
  })

  it('creates experiment with defaults', () => {
    const exp = mgr.createExperiment({ name: 'test-exp' })
    expect(exp.experimentId).toBeTruthy()
    expect(exp.name).toBe('test-exp')
    expect(exp.status).toBe('draft')
    expect(exp.variants.length).toBe(2)
    expect(exp.variants[0].id).toBe('control')
    expect(exp.variants[1].id).toBe('treatment')
  })

  it('starts and pauses experiment', () => {
    const exp = mgr.createExperiment({ name: 'exp1' })
    expect(mgr.startExperiment(exp.experimentId)).toBe(true)
    expect(mgr.getExperiment(exp.experimentId)!.status).toBe('running')
    expect(mgr.activeExperimentId).toBe(exp.experimentId)

    expect(mgr.pauseExperiment(exp.experimentId)).toBe(true)
    expect(mgr.getExperiment(exp.experimentId)!.status).toBe('paused')
  })

  it('assigns sessions deterministically', () => {
    const exp = mgr.createExperiment({ name: 'det-test', trafficSplit: 0.5 })
    mgr.startExperiment(exp.experimentId)

    const a1 = mgr.assignSession('puuid-aaa', 'session-1')
    const a2 = mgr.assignSession('puuid-aaa', 'session-1')
    expect(a1).not.toBeNull()
    expect(a2).toBe(a1)

    const a3 = mgr.assignSession('puuid-bbb', 'session-2')
    expect(a3).not.toBeNull()
    expect(a3!.experimentId).toBe(exp.experimentId)
  })

  it('distributes traffic across variants', () => {
    const exp = mgr.createExperiment({ name: 'traffic-test', trafficSplit: 0.5 })
    mgr.startExperiment(exp.experimentId)

    let controlCount = 0
    let treatmentCount = 0
    for (let i = 0; i < 100; i++) {
      const assignment = mgr.assignSession(`puuid-${i}`, `session-${i}`)
      if (assignment!.variantId === 'control') controlCount++
      else treatmentCount++
    }

    expect(controlCount).toBeGreaterThan(20)
    expect(treatmentCount).toBeGreaterThan(20)
    expect(controlCount + treatmentCount).toBe(100)
  })

  it('records metrics per variant', () => {
    const exp = mgr.createExperiment({ name: 'metrics-test' })
    mgr.startExperiment(exp.experimentId)

    const a = mgr.assignSession('p1', 's1')!
    mgr.recordAdviceGeneration('s1', [
      { type: 'mental' as any, priority: 1, title: 't', message: '', evidence: [], confidence: 0.8, audience: 'self' as const }
    ], 50, 'champ-select')
    mgr.recordFeedback('s1', 'helpful')
    mgr.recordOutcome('s1', 'win')

    const metrics = mgr.getVariantMetrics(exp.experimentId, a.variantId)
    expect(metrics).not.toBeNull()
    expect(metrics!.totalAdvices).toBe(1)
    expect(metrics!.totalFeedbackHelpful).toBe(1)
    expect(metrics!.winCount).toBe(1)
  })

  it('computes comparison between variants', () => {
    const exp = mgr.createExperiment({ name: 'compare-test', minSampleSize: 2 })
    mgr.startExperiment(exp.experimentId)

    for (let i = 0; i < 10; i++) {
      const a = mgr.assignSession(`p-${i}`, `s-${i}`)!
      if (a.variantId === 'control') {
        mgr.recordOutcome(`s-${i}`, i % 3 === 0 ? 'win' : 'loss')
      } else {
        mgr.recordOutcome(`s-${i}`, i % 2 === 0 ? 'win' : 'loss')
      }
    }

    const comparison = mgr.computeComparison(exp.experimentId)
    expect(comparison).not.toBeNull()
    expect(comparison!.controlVariantId).toBe('control')
    expect(comparison!.treatmentVariantId).toBe('treatment')
    expect(typeof comparison!.winRateDelta).toBe('number')
    expect(typeof comparison!.pValue).toBe('number')
    expect(['control', 'treatment', 'inconclusive']).toContain(comparison!.recommendation)
  })

  it('completes experiment and returns snapshot', () => {
    const exp = mgr.createExperiment({ name: 'complete-test' })
    mgr.startExperiment(exp.experimentId)
    mgr.assignSession('p1', 's1')

    const snapshot = mgr.completeExperiment(exp.experimentId)
    expect(snapshot).not.toBeNull()
    expect(snapshot!.totalSessions).toBe(1)
    expect(mgr.getExperiment(exp.experimentId)!.status).toBe('completed')
    expect(mgr.activeExperimentId).toBeNull()
  })

  it('getBackendForSession returns correct backend', () => {
    const exp = mgr.createExperiment({ name: 'backend-test' })
    mgr.startExperiment(exp.experimentId)
    const a = mgr.assignSession('p1', 's1')!
    const backend = mgr.getBackendForSession('s1')
    expect(backend).not.toBeNull()
    const variant = exp.variants.find(v => v.id === a.variantId)!
    expect(backend).toBe(variant.backend)
  })

  it('listExperiments returns all', () => {
    mgr.createExperiment({ name: 'e1' })
    mgr.createExperiment({ name: 'e2' })
    expect(mgr.listExperiments().length).toBe(2)
  })

  it('dispose clears all state', () => {
    const exp = mgr.createExperiment({ name: 'dispose-test' })
    mgr.startExperiment(exp.experimentId)
    mgr.assignSession('p1', 's1')
    mgr.dispose()
    expect(mgr.listExperiments().length).toBe(0)
    expect(mgr.activeExperimentId).toBeNull()
  })
})
