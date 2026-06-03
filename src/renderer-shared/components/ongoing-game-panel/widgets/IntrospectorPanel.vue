<template>
  <Transition name="move-from-left-fade">
    <NCard
      v-if="cas.settings.captureShowStatsInPanel"
      size="small"
      class="introspector-panel"
    >
      <template #header>
        <div class="intro-header">
          <span class="intro-title">🔍 Introspector</span>
          <div class="intro-actions">
            <NButton size="tiny" quaternary @click="handleRefresh" :loading="refreshing">
              <template #icon><NIcon><RenewIcon /></NIcon></template>
            </NButton>
            <NButton size="tiny" quaternary @click="handleDump">
              <template #icon><NIcon><DebugIcon /></NIcon></template>
            </NButton>
            <NButton size="tiny" quaternary @click="collapsed = !collapsed">
              <template #icon>
                <NIcon>
                  <ChevronUpIcon v-if="!collapsed" />
                  <ChevronDownIcon v-else />
                </NIcon>
              </template>
            </NButton>
          </div>
        </div>
      </template>

      <template v-if="!collapsed">
        <!-- 概览 -->
        <div class="intro-section" v-if="snapshot">
          <div class="intro-row">
            <span class="label">Events</span>
            <span class="value">{{ snapshot.eventCount }}</span>
          </div>
          <div class="intro-row">
            <span class="label">Checkpoints</span>
            <span class="value">{{ snapshot.checkpointCount }}</span>
          </div>
          <div class="intro-row">
            <span class="label">Probes</span>
            <span class="value">{{ snapshot.probeCount }}</span>
          </div>
          <div class="intro-row" v-if="snapshot.lastCheckpoint">
            <span class="label">Latest</span>
            <span class="value mono">{{ snapshot.lastCheckpoint }}</span>
          </div>
          <!-- 级别分布 -->
          <div class="level-dist" v-if="snapshot.levelDistribution">
            <span
              v-for="(count, level) in snapshot.levelDistribution"
              :key="level"
              class="level-badge"
              :class="`level-${level}`"
            >{{ level }}:{{ count }}</span>
          </div>
          <!-- 错误列表 -->
          <div v-if="snapshot.recentErrors.length > 0" class="error-list">
            <div v-for="(err, i) in snapshot.recentErrors" :key="i" class="error-line">{{ err }}</div>
          </div>
        </div>

        <!-- Pipeline耗时 -->
        <div class="intro-section" v-if="pipelineTimings">
          <div class="section-title">⏱ Pipeline ({{ pipelineTimings.totalMs }}ms, {{ pipelineTimings.stagesRun }} stages)</div>
          <div class="timing-bars">
            <div
              v-for="(ms, stage) in topStages"
              :key="stage"
              class="timing-row"
            >
              <span class="stage-name">{{ stage }}</span>
              <div class="stage-bar-bg">
                <div
                  class="stage-bar-fill"
                  :style="{ width: barWidth(ms) + '%' }"
                  :class="ms > 10 ? 'bar-slow' : 'bar-fast'"
                ></div>
              </div>
              <span class="stage-ms">{{ ms }}ms</span>
            </div>
          </div>
          <div v-if="Object.keys(pipelineTimings.stageErrors).length > 0" class="stage-errors">
            <div v-for="(err, stage) in pipelineTimings.stageErrors" :key="stage" class="error-line">
              ✗ {{ stage }}: {{ err }}
            </div>
          </div>
        </div>

        <!-- 缓存 -->
        <div class="intro-section" v-if="cacheStats">
          <div class="section-title">💾 Cache</div>
          <div class="cache-row">
            <span class="cache-hitrate" :class="cacheHealthClass">{{ cacheStats.hitRate }}</span>
            <span class="cache-detail">H:{{ cacheStats.hits }} M:{{ cacheStats.misses }} W:{{ cacheStats.writes }} S:{{ cacheStats.truthSize }}</span>
          </div>
        </div>

        <!-- 探针状态 -->
        <div class="intro-section" v-if="probeStates && Object.keys(probeStates).length > 0">
          <div class="section-title">📡 Probes ({{ Object.keys(probeStates).length }})</div>
          <div v-for="(state, name) in probeStates" :key="name" class="probe-entry">
            <div class="probe-name" @click="toggleProbe(name as string)">
              {{ expandedProbes.has(name as string) ? '▼' : '▶' }} {{ name }}
            </div>
            <div v-if="expandedProbes.has(name as string) && state" class="probe-detail">
              <div v-for="(val, key) in state" :key="key" class="probe-field">
                <span class="field-key">{{ key }}:</span>
                <span class="field-val mono">{{ formatValue(val) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 最近事件 -->
        <div class="intro-section" v-if="recentEvents.length > 0">
          <div class="section-title">📋 Recent Events ({{ recentEvents.length }})</div>
          <div class="event-stream">
            <div
              v-for="(evt, i) in recentEvents"
              :key="i"
              class="event-line"
              :class="`event-${evt.level}`"
            >
              <span class="event-ts">{{ formatTs(evt.timestamp) }}</span>
              <span class="event-icon">{{ levelIcon(evt.level) }}</span>
              <span class="event-src">[{{ evt.source }}]</span>
              <span class="event-msg">{{ evt.message }}</span>
            </div>
          </div>
        </div>

        <!-- Dump状态 -->
        <div v-if="dumpResult" class="dump-result">{{ dumpResult }}</div>
      </template>
    </NCard>
  </Transition>
</template>

<script setup lang="ts">
import { useCoachAdvisorStore } from '@renderer-shared/shards/advisor'
import { useInstance } from '@renderer-shared/shards'
import { CoachAdvisorRenderer } from '@renderer-shared/shards/advisor'
import {
  Renew as RenewIcon,
  ChevronUp as ChevronUpIcon,
  ChevronDown as ChevronDownIcon,
  Debug as DebugIcon
} from '@vicons/carbon'
import { NButton, NCard, NIcon } from 'naive-ui'
import { computed, ref, reactive, onMounted, onUnmounted } from 'vue'

const cas = useCoachAdvisorStore()
const ca = useInstance(CoachAdvisorRenderer)

const collapsed = ref(false)
const refreshing = ref(false)
const dumpResult = ref<string | null>(null)
const expandedProbes = reactive(new Set<string>())

const snapshot = ref<any>(null)
const pipelineTimings = ref<any>(null)
const cacheStats = ref<any>(null)
const probeStates = ref<Record<string, any>>({})
const recentEvents = ref<any[]>([])

let pollTimer: ReturnType<typeof setInterval> | null = null

async function refresh() {
  refreshing.value = true
  try {
    const [snap, timings, cache, probes, events] = await Promise.allSettled([
      ca.getIntrospectorSnapshot(),
      ca.getPipelineTimings(),
      ca.getCacheHitRate(),
      ca.getIntrospectorProbeStates(),
      ca.getIntrospectorEvents({ limit: 20 })
    ])
    if (snap.status === 'fulfilled') snapshot.value = snap.value
    if (timings.status === 'fulfilled') pipelineTimings.value = timings.value
    if (cache.status === 'fulfilled') cacheStats.value = cache.value
    if (probes.status === 'fulfilled') probeStates.value = probes.value || {}
    if (events.status === 'fulfilled') recentEvents.value = (events.value || []).reverse()
  } catch (_) {}
  refreshing.value = false
}

onMounted(() => {
  refresh()
  pollTimer = setInterval(refresh, 5000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

const topStages = computed(() => {
  if (!pipelineTimings.value?.stageTimings) return {}
  const entries = Object.entries(pipelineTimings.value.stageTimings)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 8)
  return Object.fromEntries(entries)
})

const maxStageMs = computed(() => {
  const vals = Object.values(topStages.value) as number[]
  return Math.max(...vals, 1)
})

function barWidth(ms: number): number {
  return Math.min(100, (ms / maxStageMs.value) * 100)
}

const cacheHealthClass = computed(() => {
  if (!cacheStats.value?.hitRate) return ''
  const rate = parseFloat(cacheStats.value.hitRate)
  if (rate >= 80) return 'cache-good'
  if (rate >= 50) return 'cache-ok'
  return 'cache-bad'
})

function toggleProbe(name: string) {
  if (expandedProbes.has(name)) expandedProbes.delete(name)
  else expandedProbes.add(name)
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '<null>'
  if (typeof val === 'object') {
    const s = JSON.stringify(val)
    return s.length > 50 ? s.slice(0, 47) + '...' : s
  }
  return String(val)
}

function formatTs(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23)
}

function levelIcon(level: string): string {
  const icons: Record<string, string> = {
    trace: '·', debug: '→', info: 'ℹ', warn: '⚠', error: '✗', checkpoint: '◆'
  }
  return icons[level] || '?'
}

async function handleRefresh() { await refresh() }

async function handleDump() {
  try {
    const result = await ca.triggerFullDump()
    dumpResult.value = result
    setTimeout(() => { dumpResult.value = null }, 5000)
  } catch (e) {
    dumpResult.value = `Dump failed: ${e}`
  }
}
</script>

<style lang="less" scoped>
.introspector-panel { margin-top: 8px; font-size: 11px; }
.intro-header { display: flex; align-items: center; justify-content: space-between; }
.intro-title { font-size: 13px; font-weight: 600; }
.intro-actions { display: flex; align-items: center; gap: 4px; }
.intro-section { margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.section-title { font-size: 11px; font-weight: 600; margin-bottom: 4px; opacity: 0.7; }
.intro-row { display: flex; justify-content: space-between; padding: 1px 0; }
.label { opacity: 0.5; }
.value { font-weight: 500; }
.mono { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 10px; }
.level-dist { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.level-badge { padding: 0 4px; border-radius: 2px; font-size: 10px; }
.level-trace { background: rgba(255,255,255,0.05); }
.level-debug { background: rgba(255,255,255,0.08); }
.level-info { background: rgba(56, 189, 248, 0.15); color: rgb(56, 189, 248); }
.level-warn { background: rgba(251, 191, 36, 0.15); color: rgb(251, 191, 36); }
.level-error { background: rgba(239, 68, 68, 0.15); color: rgb(239, 68, 68); }
.level-checkpoint { background: rgba(74, 222, 128, 0.15); color: rgb(74, 222, 128); }
.error-list { margin-top: 4px; }
.error-line { font-size: 10px; color: rgb(239, 68, 68); padding: 1px 0; word-break: break-all; }
.timing-bars { display: flex; flex-direction: column; gap: 2px; }
.timing-row { display: flex; align-items: center; gap: 4px; }
.stage-name { width: 100px; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.6; }
.stage-bar-bg { flex: 1; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; }
.stage-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
.bar-fast { background: rgba(74, 222, 128, 0.5); }
.bar-slow { background: rgba(251, 191, 36, 0.5); }
.stage-ms { font-size: 10px; width: 28px; text-align: right; opacity: 0.5; }
.stage-errors { margin-top: 4px; }
.cache-row { display: flex; align-items: center; gap: 8px; }
.cache-hitrate { font-size: 14px; font-weight: 600; }
.cache-good { color: rgb(74, 222, 128); }
.cache-ok { color: rgb(251, 191, 36); }
.cache-bad { color: rgb(239, 68, 68); }
.cache-detail { font-size: 10px; opacity: 0.4; }
.probe-entry { margin-bottom: 2px; }
.probe-name { cursor: pointer; padding: 1px 2px; border-radius: 2px; font-size: 10px; opacity: 0.7; &:hover { background: rgba(255,255,255,0.04); } }
.probe-detail { padding-left: 12px; }
.probe-field { display: flex; gap: 4px; padding: 0 0 1px; }
.field-key { opacity: 0.5; font-size: 10px; }
.field-val { font-size: 10px; word-break: break-all; }
.event-stream { max-height: 160px; overflow-y: auto; }
.event-line { display: flex; gap: 4px; padding: 1px 0; font-size: 10px; }
.event-ts { opacity: 0.3; font-family: monospace; flex-shrink: 0; }
.event-icon { flex-shrink: 0; }
.event-src { opacity: 0.5; flex-shrink: 0; }
.event-msg { word-break: break-all; }
.event-error { color: rgb(239, 68, 68); }
.event-warn { color: rgb(251, 191, 36); }
.event-checkpoint { color: rgb(74, 222, 128); }
.dump-result { margin-top: 4px; padding: 4px 6px; background: rgba(74, 222, 128, 0.1); border-radius: 3px; font-size: 10px; color: rgb(74, 222, 128); }
</style>
