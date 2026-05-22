<template>
  <Transition name="move-from-left-fade">
    <NCard
      v-if="cas.settings.enabled && hasContent"
      size="small"
      class="coach-panel"
    >
      <template #header>
        <div class="coach-header">
          <span class="coach-title">\U0001F3AF {{ t('CoachPanel.title') }}</span>
          <div class="coach-actions">
            <NPopover :delay="50" :keep-alive-on-hover="false">
              <template #trigger>
                <div
                  v-if="cas.state.pipelineInfo"
                  class="tag"
                  :class="scoreDiffClass"
                >
                  {{ scoreDiffLabel }}
                </div>
              </template>
              <div class="popover-text">
                {{ t('CoachPanel.pipelineTooltip') }}
              </div>
            </NPopover>
            <div v-if="loadProgress && loadProgress.percentage < 100" class="load-progress">
              <NProgress
                type="line"
                :percentage="loadProgress.percentage"
                :show-indicator="false"
                :height="3"
                style="width: 60px"
              />
              <span class="load-text">{{ loadProgress.percentage }}%</span>
            </div>
            <NPopover :delay="50" v-if="cas.state.lastComparison">
              <template #trigger>
                <NButton size="tiny" quaternary>
                  <template #icon>
                    <NIcon><ChartRadarIcon /></NIcon>
                  </template>
                </NButton>
              </template>
              <div class="dimension-detail">
                <div class="dimension-title">{{ t('CoachPanel.dimensionDetail') }}</div>
                <div
                  v-for="dim in dimensionEntries"
                  :key="dim.key"
                  class="dimension-row"
                >
                  <span class="dim-label">{{ dim.label }}</span>
                  <div class="dim-bar-container">
                    <div class="dim-bar dim-ally" :style="{ width: dim.allyPct + '%' }"></div>
                    <div class="dim-bar dim-enemy" :style="{ width: dim.enemyPct + '%' }"></div>
                  </div>
                  <span class="dim-delta" :class="dim.deltaClass">{{ dim.deltaStr }}</span>
                </div>
              </div>
            </NPopover>
            <NButton
              size="tiny"
              quaternary
              :loading="cas.state.isGenerating"
              @click="handleRefresh"
            >
              <template #icon>
                <NIcon><RenewIcon /></NIcon>
              </template>
            </NButton>
            <NButton
              size="tiny"
              quaternary
              @click="collapsed = !collapsed"
            >
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
        <div v-if="groupedAdvices.length > 0" class="coach-advice-groups">
          <div v-for="group in groupedAdvices" :key="group.type" class="advice-group">
            <div class="group-header" @click="toggleGroup(group.type)">
              <span class="group-icon">{{ group.icon }}</span>
              <span class="group-label">{{ group.label }}</span>
              <span class="group-count">({{ group.items.length }})</span>
              <NIcon size="12" class="group-chevron">
                <ChevronUpIcon v-if="!collapsedGroups.has(group.type)" />
                <ChevronDownIcon v-else />
              </NIcon>
            </div>
            <Transition name="fade">
              <div v-if="!collapsedGroups.has(group.type)" class="group-items">
                <div
                  v-for="(advice, idx) in group.items"
                  :key="idx"
                  class="advice-item"
                  :class="priorityClass(advice.priority)"
                >
                  <div class="advice-content">
                    <span class="advice-title">{{ advice.title }}</span>
                    <span class="advice-message">{{ advice.message }}</span>
                  </div>
                  <div class="advice-item-actions">
                    <span class="advice-confidence" :title="t('CoachPanel.confidence')">{{ (advice.confidence * 100).toFixed(0) }}%</span>
                    <NButton size="tiny" quaternary @click="handleItemFeedback(advice, 'helpful')" :disabled="feedbackSent.has(adviceKey(advice))">&#128077;</NButton>
                    <NButton size="tiny" quaternary @click="handleItemFeedback(advice, 'not-helpful')" :disabled="feedbackSent.has(adviceKey(advice))">&#128078;</NButton>
                    <NButton size="tiny" quaternary @click="handleItemFeedback(advice, 'dismiss')" :disabled="feedbackSent.has(adviceKey(advice))">&#10005;</NButton>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
        <div v-else-if="cas.state.formattedMessages.length > 0" class="coach-advice-list">
          <div v-for="(msg, idx) in displayMessages" :key="idx" class="advice-line">{{ msg }}</div>
        </div>
        <div v-else-if="cas.state.isGenerating" class="coach-advice-list">
          <div class="advice-line analyzing">{{ t('CoachPanel.analyzing') }}</div>
        </div>
        <div v-if="failedPuuids.length > 0" class="failed-notice">
          <span>{{ t('CoachPanel.dataLoadFailed', { count: failedPuuids.length }) }}</span>
          <NButton size="tiny" quaternary @click="handleRefresh">{{ t('CoachPanel.retry') }}</NButton>
        </div>
      </template>
      <template #footer v-if="cas.state.lastGeneratedAt">
        <div class="coach-footer">
          <span class="coach-timestamp">
            {{ t('CoachPanel.generatedAt', { time: formattedTime }) }}
            <span v-if="cas.state.currentPhase" class="phase-tag">{{ cas.state.currentPhase }}</span>
          </span>
          <div class="coach-footer-stats" v-if="schedulerStats">
            <span class="stat-item">\U0001F4CB {{ schedulerStats.pendingCount }}</span>
            <span class="stat-item">\u2705 {{ schedulerStats.totalDeliveredAllTime }}</span>
          </div>
        </div>
      </template>
    </NCard>
  </Transition>
</template>

<script setup lang="ts">
import { useCoachAdvisorStore } from '@renderer-shared/shards/coach-advisor'
import { useInstance } from '@renderer-shared/shards'
import { CoachAdvisorRenderer } from '@renderer-shared/shards/coach-advisor'
import {
  Renew as RenewIcon,
  ChevronUp as ChevronUpIcon,
  ChevronDown as ChevronDownIcon,
  ChartRadar as ChartRadarIcon
} from '@vicons/carbon'
import { useTranslation } from 'i18next-vue'
import { NButton, NCard, NIcon, NPopover, NProgress } from 'naive-ui'
import { computed, ref, reactive, onMounted, onUnmounted } from 'vue'

const { t } = useTranslation()
const cas = useCoachAdvisorStore()
const ca = useInstance(CoachAdvisorRenderer)

const collapsed = ref(false)
const collapsedGroups = reactive(new Set<string>())
const feedbackSent = reactive(new Set<string>())
const loadProgress = ref<{ loaded: number; total: number; percentage: number } | null>(null)
const failedPuuids = ref<string[]>([])
const schedulerStats = ref<Record<string, number> | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  pollTimer = setInterval(async () => {
    try {
      loadProgress.value = await ca.getLoadProgress()
      failedPuuids.value = await ca.getFailedPuuids()
      const stats = await ca.getSchedulerStats()
      if (stats) schedulerStats.value = stats
    } catch (_) {}
  }, 3000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

const hasContent = computed(() => {
  return cas.state.formattedMessages.length > 0 || cas.state.isGenerating || cas.state.advices.length > 0
})

const displayMessages = computed(() => {
  if (cas.state.isGenerating && cas.state.formattedMessages.length === 0) {
    return [t('CoachPanel.analyzing')]
  }
  return cas.state.formattedMessages
})

interface AdviceItem {
  type: string
  title: string
  message: string
  priority: number
  confidence: number
  audience: string
}

const TYPE_META: Record<string, { icon: string; label: string; order: number }> = {
  enemy_weakness: { icon: '\u2694\uFE0F', label: '\u5BF9\u624B\u5F31\u70B9', order: 0 },
  team_synergy: { icon: '\U0001F91D', label: '\u961F\u53CB\u72B6\u6001', order: 1 },
  lane_matchup: { icon: '\U0001F6E1\uFE0F', label: '\u5BF9\u7EBF\u5206\u6790', order: 2 },
  macro_strategy: { icon: '\U0001F5FA\uFE0F', label: '\u5B8F\u89C2\u7B56\u7565', order: 3 },
  composition: { icon: '\U0001F9E9', label: '\u9635\u5BB9\u5206\u6790', order: 4 },
  itemization_hint: { icon: '\U0001F6D2', label: '\u51FA\u88C5\u63D0\u793A', order: 5 },
  gold_efficiency: { icon: '\U0001F4B0', label: '\u7ECF\u6D4E\u6548\u7387', order: 6 },
  true_damage_warning: { icon: '\U0001F525', label: '\u771F\u4F24\u9884\u8B66', order: 7 },
  win_condition: { icon: '\U0001F3C6', label: '\u80DC\u5229\u6761\u4EF6', order: 8 },
  kda_trend: { icon: '\U0001F4CA', label: 'KDA\u8D8B\u52BF', order: 9 },
  objective_timing: { icon: '\U0001F409', label: '\u76EE\u6807\u4E89\u593A', order: 10 },
  playstyle_adaptation: { icon: '\U0001F504', label: '\u98CE\u683C\u9002\u914D', order: 11 },
  cherry_strategy: { icon: '\U0001F352', label: '\u7ADE\u6280\u573A\u7B56\u7565', order: 12 },
  risk_warning: { icon: '\u26A0\uFE0F', label: '\u98CE\u9669\u63D0\u793A', order: 13 },
  rank_disparity: { icon: '\U0001F4C8', label: '\u6BB5\u4F4D\u5DEE\u8DDD', order: 14 },
  mental: { icon: '\U0001F9E0', label: '\u5FC3\u6001\u63D0\u793A', order: 15 }
}

const groupedAdvices = computed(() => {
  const advices = cas.state.advices as AdviceItem[]
  if (!advices || advices.length === 0) return []

  const groups: Record<string, AdviceItem[]> = {}
  for (const advice of advices) {
    if (!groups[advice.type]) groups[advice.type] = []
    groups[advice.type].push(advice)
  }

  return Object.entries(groups)
    .map(([type, items]) => {
      const meta = TYPE_META[type] || { icon: '\U0001F4A1', label: type, order: 99 }
      return { type, icon: meta.icon, label: meta.label, order: meta.order, items: items.sort((a, b) => a.priority - b.priority) }
    })
    .sort((a, b) => a.order - b.order)
})

const DIMENSION_LABELS: Record<string, string> = {
  damage: '\u8F93\u51FA',
  tankiness: '\u5766\u5EA6',
  vision: '\u89C6\u91CE',
  participation: '\u53C2\u56E2',
  trueDamage: '\u771F\u4F24',
  goldEfficiency: '\u7ECF\u6D4E\u6548\u7387',
  kdaTrend: 'KDA'
}

const dimensionEntries = computed(() => {
  const comp = cas.state.lastComparison
  if (!comp) return []
  return Object.entries(comp.dimensionDeltas || {}).map(([key, delta]) => {
    const allyVal = comp.allyProfile ? getDimFromProfile(comp.allyProfile, key) : 0.5
    const enemyVal = comp.enemyProfile ? getDimFromProfile(comp.enemyProfile, key) : 0.5
    const d = delta as number
    return {
      key,
      label: DIMENSION_LABELS[key] || key,
      allyPct: Math.round(Math.max(allyVal, 0) * 100),
      enemyPct: Math.round(Math.max(enemyVal, 0) * 100),
      deltaStr: d >= 0 ? `+${(d * 100).toFixed(0)}%` : `${(d * 100).toFixed(0)}%`,
      deltaClass: d > 0.05 ? 'delta-positive' : d < -0.05 ? 'delta-negative' : 'delta-neutral'
    }
  })
})

function getDimFromProfile(profile: Record<string, any>, dim: string): number {
  const map: Record<string, string> = {
    damage: 'avgDamageShare', tankiness: 'avgTankinessShare', vision: 'avgVisionScore',
    participation: 'avgParticipation', trueDamage: 'avgTrueDamageShare',
    goldEfficiency: 'avgGoldEfficiency', kdaTrend: 'avgKdVariance'
  }
  return profile[map[dim] || dim] ?? 0
}

const scoreDiffLabel = computed(() => {
  const info = cas.state.pipelineInfo
  if (!info) return ''
  if (info.scoreDiff > 3) return t('CoachPanel.teamAdvantage')
  if (info.scoreDiff < -3) return t('CoachPanel.teamDisadvantage')
  return t('CoachPanel.teamBalanced')
})

const scoreDiffClass = computed(() => {
  const info = cas.state.pipelineInfo
  if (!info) return ''
  if (info.scoreDiff > 3) return 'score-ahead'
  if (info.scoreDiff < -3) return 'score-behind'
  return 'score-even'
})

const formattedTime = computed(() => {
  if (!cas.state.lastGeneratedAt) return ''
  const d = new Date(cas.state.lastGeneratedAt)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

function adviceKey(advice: AdviceItem): string {
  return `${advice.type}:${advice.title}`
}

function priorityClass(priority: number): string {
  if (priority <= 0) return 'priority-critical'
  if (priority <= 1) return 'priority-high'
  if (priority <= 2) return 'priority-medium'
  return 'priority-low'
}

function toggleGroup(type: string) {
  if (collapsedGroups.has(type)) collapsedGroups.delete(type)
  else collapsedGroups.add(type)
}

async function handleRefresh() {
  try { await ca.generateAdvices() } catch (_) {}
}

async function handleItemFeedback(advice: AdviceItem, feedback: 'helpful' | 'not-helpful' | 'dismiss') {
  const key = adviceKey(advice)
  if (feedbackSent.has(key)) return
  feedbackSent.add(key)
  try { await ca.recordFeedback(advice.type, feedback) } catch (_) {}
}
</script>

<style lang="less" scoped>
.coach-panel { margin-top: 8px; }
.coach-header { display: flex; align-items: center; justify-content: space-between; }
.coach-title { font-size: 13px; font-weight: 600; }
.coach-actions { display: flex; align-items: center; gap: 6px; }
.load-progress { display: flex; align-items: center; gap: 4px; }
.load-text { font-size: 10px; opacity: 0.5; }
.tag { font-size: 11px; padding: 1px 6px; border-radius: 2px; line-height: 18px; white-space: nowrap; }
.score-ahead { background-color: rgba(63, 185, 80, 0.2); color: rgb(63, 185, 80); }
.score-behind { background-color: rgba(230, 114, 41, 0.2); color: rgb(230, 114, 41); }
.score-even { background-color: rgba(255, 255, 255, 0.1); }
[data-theme='light'] { .score-even { background-color: rgba(0, 0, 0, 0.06); } }
.popover-text { font-size: 12px; }
.dimension-detail { min-width: 220px; }
.dimension-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.dimension-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.dim-label { font-size: 11px; width: 50px; flex-shrink: 0; }
.dim-bar-container { flex: 1; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; display: flex; overflow: hidden; gap: 1px; }
.dim-bar { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
.dim-ally { background-color: rgba(63, 185, 80, 0.6); }
.dim-enemy { background-color: rgba(230, 114, 41, 0.5); }
.dim-delta { font-size: 10px; width: 36px; text-align: right; flex-shrink: 0; }
.delta-positive { color: rgb(63, 185, 80); }
.delta-negative { color: rgb(230, 114, 41); }
.delta-neutral { opacity: 0.5; }
.coach-advice-groups { display: flex; flex-direction: column; gap: 4px; }
.advice-group { border-radius: 4px; }
.group-header { display: flex; align-items: center; gap: 4px; padding: 3px 4px; cursor: pointer; border-radius: 3px; font-size: 12px; font-weight: 500; user-select: none; &:hover { background: rgba(255,255,255,0.04); } }
.group-icon { font-size: 12px; }
.group-count { font-size: 10px; opacity: 0.5; }
.group-chevron { margin-left: auto; opacity: 0.4; }
.group-items { padding-left: 8px; }
.advice-item { display: flex; align-items: flex-start; justify-content: space-between; padding: 3px 4px; border-radius: 3px; margin-bottom: 2px; border-left: 2px solid transparent; }
.priority-critical { border-left-color: rgb(230, 60, 60); }
.priority-high { border-left-color: rgb(230, 165, 41); }
.priority-medium { border-left-color: rgb(63, 185, 80); }
.priority-low { border-left-color: rgba(255, 255, 255, 0.15); }
.advice-content { flex: 1; min-width: 0; }
.advice-title { font-size: 12px; font-weight: 500; margin-right: 6px; }
.advice-message { font-size: 11px; opacity: 0.7; word-break: break-word; }
.advice-item-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; margin-left: 4px; }
.advice-confidence { font-size: 9px; opacity: 0.4; margin-right: 2px; }
.failed-notice { margin-top: 6px; padding: 4px 8px; background: rgba(230, 114, 41, 0.1); border-radius: 3px; font-size: 11px; display: flex; align-items: center; justify-content: space-between; color: rgb(230, 165, 41); }
.coach-advice-list { display: flex; flex-direction: column; gap: 2px; }
.advice-line { font-size: 12px; line-height: 1.6; word-break: break-word; }
.advice-line.analyzing { opacity: 0.5; }
.coach-footer { display: flex; align-items: center; justify-content: space-between; }
.coach-timestamp { font-size: 11px; opacity: 0.4; }
.phase-tag { margin-left: 4px; padding: 0 4px; background: rgba(255,255,255,0.06); border-radius: 2px; font-size: 10px; }
.coach-footer-stats { display: flex; gap: 8px; }
.stat-item { font-size: 10px; opacity: 0.4; }
.coach-feedback-actions { display: flex; gap: 2px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
