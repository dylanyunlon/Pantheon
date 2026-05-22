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
    </NCard>
  </NScrollbar>
</template>

<script setup lang="ts">
import ControlItem from '@renderer-shared/components/ControlItem.vue'
import { useInstance } from '@renderer-shared/shards'
import { CoachAdvisorRenderer, useCoachAdvisorStore } from '@renderer-shared/shards/coach-advisor'
import { useTranslation } from 'i18next-vue'
import { NCard, NInputNumber, NScrollbar, NSwitch } from 'naive-ui'

const { t } = useTranslation()
const cas = useCoachAdvisorStore()
const ca = useInstance(CoachAdvisorRenderer)
</script>

<style lang="less" scoped>
.control-item-margin {
  &:not(:last-child) {
    margin-bottom: 8px;
  }
}
</style>
