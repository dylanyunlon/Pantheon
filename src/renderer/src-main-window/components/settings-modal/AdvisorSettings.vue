<template>
  <NScrollbar style="height: 65vh">
    <NCard size="small">
      <template #header>
        <span class="card-header-title">{{ t('AdvisorSettings.titleCommon') }}</span>
      </template>
      <ControlItem
        class="control-item-margin"
        :label="t('AdvisorSettings.enabled.label')"
        :label-description="t('AdvisorSettings.enabled.description')"
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
        :label="t('AdvisorSettings.maxAdviceCount.label')"
        :label-description="t('AdvisorSettings.maxAdviceCount.description')"
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
        :label="t('AdvisorSettings.autoGenerateInChampSelect.label')"
        :label-description="t('AdvisorSettings.autoGenerateInChampSelect.description')"
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
        :label="t('AdvisorSettings.autoGenerateInGame.label')"
        :label-description="t('AdvisorSettings.autoGenerateInGame.description')"
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
        <span class="card-header-title">{{ t('AdvisorSettings.titleCategories') }}</span>
      </template>
      <ControlItem
        class="control-item-margin"
        :label="t('AdvisorSettings.showEnemyWeakness.label')"
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
        :label="t('AdvisorSettings.showTeamSynergy.label')"
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
        :label="t('AdvisorSettings.showMacroStrategy.label')"
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
        :label="t('AdvisorSettings.showMentalAdvice.label')"
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
        :label="t('AdvisorSettings.showLaneMatchup.label')"
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
        :label="t('AdvisorSettings.showRankDisparity.label')"
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
        :label="t('AdvisorSettings.showComposition.label')"
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
        :label="t('AdvisorSettings.showItemization.label')"
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
        :label="t('AdvisorSettings.showObjectiveTiming.label')"
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
        :label="t('AdvisorSettings.showPlaystyleAdaptation.label')"
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
        :label="t('AdvisorSettings.showGoldEfficiency.label')"
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
        :label="t('AdvisorSettings.showTrueDamageWarning.label')"
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
        :label="t('AdvisorSettings.showWinCondition.label')"
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
        :label="t('AdvisorSettings.showKdaTrend.label')"
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
        <span class="card-header-title">{{ t('AdvisorSettings.titleAdvanced') }}</span>
      </template>
      <ControlItem class="control-item-margin" :label="t('AdvisorSettings.captureEnabled.label')" :label-description="t('AdvisorSettings.captureEnabled.description')" :label-width="400">
        <NSwitch size="small" :value="cas.settings.captureEnabled" @update:value="(val) => ca.setCaptureEnabled(val)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('AdvisorSettings.captureShowStatsInPanel.label')" :label-description="t('AdvisorSettings.captureShowStatsInPanel.description')" :label-width="400">
        <NSwitch size="small" :value="cas.settings.captureShowStatsInPanel" @update:value="(val) => ca.setCaptureShowStatsInPanel(val)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('AdvisorSettings.captureAutoFlushInterval.label')" :label-description="t('AdvisorSettings.captureAutoFlushInterval.description')" :label-width="400">
        <NInputNumber style="width: 100px" size="small" :min="5000" :max="120000" :step="1000" :value="cas.settings.captureAutoFlushInterval" @update:value="(val) => ca.setCaptureAutoFlushInterval(val || 15000)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('AdvisorSettings.captureEventCapacity.label')" :label-description="t('AdvisorSettings.captureEventCapacity.description')" :label-width="400">
        <NInputNumber style="width: 100px" size="small" :min="50" :max="5000" :step="50" :value="cas.settings.captureEventCapacity" @update:value="(val) => ca.setCaptureEventCapacity(val || 500)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('AdvisorSettings.captureSampleCapacity.label')" :label-description="t('AdvisorSettings.captureSampleCapacity.description')" :label-width="400">
        <NInputNumber style="width: 100px" size="small" :min="10" :max="1000" :step="10" :value="cas.settings.captureSampleCapacity" @update:value="(val) => ca.setCaptureSampleCapacity(val || 100)" />
      </ControlItem>
      <ControlItem v-if="cas.settings.captureEnabled" class="control-item-margin" :label="t('AdvisorSettings.captureExportFormat.label')" :label-description="t('AdvisorSettings.captureExportFormat.description')" :label-width="400">
        <NSelect style="width: 160px" size="small" :value="cas.settings.captureExportFormat" :options="exportFormatOptions" @update:value="(val) => ca.setCaptureExportFormat(val)" />
      </ControlItem>
      <div class="advanced-info">
        <div class="info-row"><span class="info-label">{{ t('AdvisorSettings.schedulerPhase') }}</span><span class="info-value">{{ cas.state.currentGamePhase || '-' }}</span></div>
        <div class="info-row" v-if="captureStats"><span class="info-label">{{ t('AdvisorSettings.experimentEvents') }}</span><span class="info-value">{{ captureStats.eventCount }}</span></div>
        <div class="info-row" v-if="captureStats"><span class="info-label">{{ t('AdvisorSettings.experimentSamples') }}</span><span class="info-value">{{ captureStats.sampleCount }}</span></div>
        <div class="info-row" v-if="captureStats"><span class="info-label">{{ t('AdvisorSettings.sessionActive') }}</span><span class="info-value">{{ captureStats.isActive ? '\u2705' : '\u274C' }}</span></div>
        <div class="info-row" v-if="captureStats"><span class="info-label">{{ t('AdvisorSettings.captureStats.merges') }}</span><span class="info-value">{{ captureStats.mergeCount }}</span></div>
      </div>
      <NButton v-if="cas.settings.captureEnabled && captureStats" size="small" style="margin-top: 8px" :loading="isExporting" @click="handleExportData">{{ t('AdvisorSettings.captureExportButton') }}</NButton>
    </NCard>
  </NScrollbar>
</template>

<script setup lang="ts">
import ControlItem from '@renderer-shared/components/ControlItem.vue'
import { useInstance } from '@renderer-shared/shards'
import { CoachAdvisorRenderer, useCoachAdvisorStore } from '@renderer-shared/shards/advisor'
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
  try { const d = await ca.getExperimentExport(); const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `advisor-capture-${Date.now()}.json`; a.click(); URL.revokeObjectURL(u) } catch (_) {}
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
