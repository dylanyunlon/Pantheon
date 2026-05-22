<template>
  <Transition name="move-from-left-fade">
    <NCard
      v-if="cas.settings.enabled && hasContent"
      size="small"
      class="coach-panel"
    >
      <template #header>
        <div class="coach-header">
          <span class="coach-title">🎯 {{ t('CoachPanel.title') }}</span>
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
          </div>
        </div>
      </template>
      <div class="coach-advice-list">
        <div
          v-for="(msg, idx) in displayMessages"
          :key="idx"
          class="advice-line"
        >
          {{ msg }}
        </div>
      </div>
      <template #footer v-if="cas.state.lastGeneratedAt">
        <span class="coach-timestamp">
          {{ t('CoachPanel.generatedAt', { time: formattedTime }) }}
        </span>
      </template>
    </NCard>
  </Transition>
</template>

<script setup lang="ts">
import { useCoachAdvisorStore } from '@renderer-shared/shards/coach-advisor'
import { useInstance } from '@renderer-shared/shards'
import { CoachAdvisorRenderer } from '@renderer-shared/shards/coach-advisor'
import { Renew as RenewIcon } from '@vicons/carbon'
import { useTranslation } from 'i18next-vue'
import { NButton, NCard, NIcon, NPopover } from 'naive-ui'
import { computed } from 'vue'

const { t } = useTranslation()
const cas = useCoachAdvisorStore()
const ca = useInstance(CoachAdvisorRenderer)

const hasContent = computed(() => {
  return cas.state.formattedMessages.length > 0 || cas.state.isGenerating
})

const displayMessages = computed(() => {
  if (cas.state.isGenerating && cas.state.formattedMessages.length === 0) {
    return [t('CoachPanel.analyzing')]
  }
  return cas.state.formattedMessages
})

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

async function handleRefresh() {
  try {
    await ca.generateAdvices()
  } catch (_) {}
}
</script>

<style lang="less" scoped>
.coach-panel {
  margin-top: 8px;
}

.coach-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.coach-title {
  font-size: 13px;
  font-weight: 600;
}

.coach-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 2px;
  line-height: 18px;
  white-space: nowrap;
}

.score-ahead {
  background-color: rgba(63, 185, 80, 0.2);
  color: rgb(63, 185, 80);
}

.score-behind {
  background-color: rgba(230, 114, 41, 0.2);
  color: rgb(230, 114, 41);
}

.score-even {
  background-color: rgba(255, 255, 255, 0.1);
}

[data-theme='light'] {
  .score-even {
    background-color: rgba(0, 0, 0, 0.06);
  }
}

.popover-text {
  font-size: 12px;
}

.coach-advice-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.advice-line {
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.coach-timestamp {
  font-size: 11px;
  opacity: 0.4;
}
</style>
