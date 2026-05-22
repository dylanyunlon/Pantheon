<template>
  <NScrollbar style="height: 65vh">
    <NCard size="small">
      <template #header>
        <span class="card-header-title">{{ t('CoachAdvisorSettings.titleCommon') }}</span>
      </template>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.enabled.label')"
        :label-description="t('CoachAdvisorSettings.enabled.description')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.enabled"
          @update:value="(val) => ca.setEnabled(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.maxAdviceCount.label')"
        :label-description="t('CoachAdvisorSettings.maxAdviceCount.description')"
        :label-width="400"
      >
        <NInputNumber
          style="width: 100px"
          size="small"
          :min="1"
          :max="20"
          :value="cas.settings.maxAdviceCount"
          @update:value="(val) => ca.setMaxAdviceCount(val || 6)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.autoGenerateInChampSelect.label')"
        :label-description="t('CoachAdvisorSettings.autoGenerateInChampSelect.description')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.autoGenerateInChampSelect"
          @update:value="(val) => ca.setAutoGenerateInChampSelect(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.autoGenerateInGame.label')"
        :label-description="t('CoachAdvisorSettings.autoGenerateInGame.description')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.autoGenerateInGame"
          @update:value="(val) => ca.setAutoGenerateInGame(val)"
        />
      </ControlItem>
    </NCard>

    <NCard size="small" style="margin-top: 8px">
      <template #header>
        <span class="card-header-title">{{ t('CoachAdvisorSettings.titleCategories') }}</span>
      </template>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showEnemyWeakness.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showEnemyWeakness"
          @update:value="(val) => ca.setShowEnemyWeakness(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showTeamSynergy.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showTeamSynergy"
          @update:value="(val) => ca.setShowTeamSynergy(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showMacroStrategy.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showMacroStrategy"
          @update:value="(val) => ca.setShowMacroStrategy(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showMentalAdvice.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showMentalAdvice"
          @update:value="(val) => ca.setShowMentalAdvice(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showLaneMatchup.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showLaneMatchup"
          @update:value="(val) => ca.setShowLaneMatchup(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showRankDisparity.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showRankDisparity"
          @update:value="(val) => ca.setShowRankDisparity(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showComposition.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showComposition"
          @update:value="(val) => ca.setShowComposition(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showItemization.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showItemization"
          @update:value="(val) => ca.setShowItemization(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showObjectiveTiming.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showObjectiveTiming"
          @update:value="(val) => ca.setShowObjectiveTiming(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showPlaystyleAdaptation.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showPlaystyleAdaptation"
          @update:value="(val) => ca.setShowPlaystyleAdaptation(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showGoldEfficiency.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showGoldEfficiency"
          @update:value="(val) => ca.setShowGoldEfficiency(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showTrueDamageWarning.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showTrueDamageWarning"
          @update:value="(val) => ca.setShowTrueDamageWarning(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showWinCondition.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showWinCondition"
          @update:value="(val) => ca.setShowWinCondition(val)"
        />
      </ControlItem>
      <ControlItem
        class="control-item-margin"
        :label="t('CoachAdvisorSettings.showKdaTrend.label')"
        :label-width="400"
      >
        <NSwitch
          size="small"
          :value="cas.settings.showKdaTrend"
          @update:value="(val) => ca.setShowKdaTrend(val)"
        />
      </ControlItem>
    </NCard>

    <NCard size="small" style="margin-top: 8px">
      <template #header>
        <span class="card-header-title">{{ t('CoachAdvisorSettings.titleAdvanced') }}</span>
      </template>
      <ControlItem class="control-item-margin" :label="t('CoachAdvisorSettings.captureEnabled.label')" :label-description="t('CoachAdvisorSettings.captureEnabled.description')" :label-width="400">
        <NSwitch size="small" :value="cas.settings.captureEnabled" @update:value="(val) => ca.setCaptureEnabled(val)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('CoachAdvisorSettings.captureShowStatsInPanel.label')" :label-description="t('CoachAdvisorSettings.captureShowStatsInPanel.description')" :label-width="400">
        <NSwitch size="small" :value="cas.settings.captureShowStatsInPanel" @update:value="(val) => ca.setCaptureShowStatsInPanel(val)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('CoachAdvisorSettings.captureAutoFlushInterval.label')" :label-description="t('CoachAdvisorSettings.captureAutoFlushInterval.description')" :label-width="400">
        <NInputNumber style="width: 100px" size="small" :min="5000" :max="120000" :step="1000" :value="cas.settings.captureAutoFlushInterval" @update:value="(val) => ca.setCaptureAutoFlushInterval(val || 15000)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('CoachAdvisorSettings.captureEventCapacity.label')" :label-description="t('CoachAdvisorSettings.captureEventCapacity.description')" :label-width="400">
        <NInputNumber style="width: 100px" size="small" :min="50" :max="5000" :step="50" :value="cas.settings.captureEventCapacity" @update:value="(val) => ca.setCaptureEventCapacity(val || 500)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('CoachAdvisorSettings.captureSampleCapacity.label')" :label-description="t('CoachAdvisorSettings.captureSampleCapacity.description')" :label-width="400">
        <NInputNumber style="width: 100px" size="small" :min="10" :max="1000" :step="10" :value="cas.settings.captureSampleCapacity" @update:value="(val) => ca.setCaptureSampleCapacity(val || 100)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('CoachAdvisorSettings.captureExportFormat.label')" :label-description="t('CoachAdvisorSettings.captureExportFormat.description')" :label-width="400">
        <NSelect style="width: 160px" size="small" :value="cas.settings.captureExportFormat" :options="exportFormatOptions" @update:value="(val) => ca.setCaptureExportFormat(val)" />
      </ControlItem>
      <div class="advanced-info">
        <div class="info-row"><span class="info-label">{{ t('CoachAdvisorSettings.schedulerPhase') }}</span><span class="info-value">{{ cas.state.currentPhase || '-' }}</span></div>
        <div class="info-row" v-if="captureStats"><span class="info-label">{{ t('CoachAdvisorSettings.experimentEvents') }}</span><span class="info-value">{{ captureStats.eventCount }}</span></div>
        <div class="info-row" v-if="captureStats"><span class="info-label">{{ t('CoachAdvisorSettings.experimentSamples') }}</span><span class="info-value">{{ captureStats.sampleCount }}</span></div>
        <div class="info-row" v-if="captureStats"><span class="info-label">{{ t('CoachAdvisorSettings.sessionActive') }}</span><span class="info-value">{{ captureStats.isActive ? '\u2705' : '\u274C' }}</span></div>
        <div class="info-row" v-if="captureStats"><span class="info-label">{{ t('CoachAdvisorSettings.captureStats.merges') }}</span><span class="info-value">{{ captureStats.mergeCount }}</span></div>
      </div>
      <NButton v-if="cas.settings.captureEnabled && captureStats" size="small" style="margin-top: 8px" :loading="isExporting" @click="handleExportData">{{ t('CoachAdvisorSettings.captureExportButton') }}</NButton>
    </NCard>
  </NScrollbar>
</template>

<script setup lang="ts">
import ControlItem from '@renderer-shared/components/ControlItem.vue'
import { useInstance } from '@renderer-shared/shards'
import { CoachAdvisorRenderer, useCoachAdvisorStore } from '@renderer-shared/shards/coach-advisor'
import { useTranslation } from 'i18next-vue'
import { NButton, NCard, NInputNumber, NScrollbar, NSelect, NSwitch } from 'naive-ui'
import { ref, onMounted, onUnmounted } from 'vue'

const { t } = useTranslation()
const cas = useCoachAdvisorStore()
const ca = useInstance(CoachAdvisorRenderer)

const captureStats = ref<{ sessionId: string; isActive: boolean; eventCount: number; sampleCount: number; mergeCount: number } | null>(null)
const isExporting = ref(false)
const exportFormatOptions = [{ label: 'JSON', value: 'json' }, { label: 'CSV', value: 'csv' }]
let pollTimer: ReturnType<typeof setInterval> | null = null
async function refreshCaptureStats() { try { captureStats.value = await ca.getCaptureStats() } catch (_) {} }
onMounted(() => { refreshCaptureStats(); pollTimer = setInterval(refreshCaptureStats, 5000) })
onUnmounted(() => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } })
async function handleExportData() {
  isExporting.value = true
  try { const d = await ca.getExperimentExport(); const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `coach-capture-${Date.now()}.json`; a.click(); URL.revokeObjectURL(u) } catch (_) {}
  isExporting.value = false
}
</script>

<style lang="less" scoped>
.control-item-margin {
  &:not(:last-child) {
    margin-bottom: 8px;
  }
}

.advanced-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.info-label {
  opacity: 0.6;
}

.info-value {
  font-family: monospace;
  font-size: 11px;
}
</style>
