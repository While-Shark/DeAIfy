<script setup lang="ts">
import { ArrowDownRight, Cpu, Globe2, LockKeyhole } from 'lucide-vue-next';
import AppHeader from './components/AppHeader.vue';
import UploadPanel from './components/UploadPanel.vue';
import ScoreCard from './components/ScoreCard.vue';
import ImageWorkspace from './components/ImageWorkspace.vue';
import AdjustmentsPanel from './components/AdjustmentsPanel.vue';
import AdvancedStudio from './components/AdvancedStudio.vue';
import ExportPanel from './components/ExportPanel.vue';
import ExportReviewDialog from './components/ExportReviewDialog.vue';
import { useEditor } from './composables/useEditor';
import type { ProcessingParams } from './types/editor';

const {
  file, filename, readableSize, originalUrl, previewUrl, dimensions, params, presetId,
  comparePercent, score, processedScore, scanStatus, processedScanStatus, downloadProgress,
  scanPhase, provenance, uploadError, scanError, previewError, isPreviewing,
  exportFormat, selectFile, selectPreset, rerunAssessment, reviewBeforeExport, reset,
  reviewOpen, reviewStage, reviewReport, reviewError, retryExportReview, confirmExportReview, cancelReview,
  mode, selectMode, brushEnabled, brushTool, brushRadius, brushAmount, strokes,
  addBrushStroke, completeBrushStroke, undoBrush, clearBrush,
  includeSecondary, advanced, runAdvancedAnalysis, evaluation,
} = useEditor();
const { report: advancedReport, busy: advancedBusy, stage: advancedStage, error: advancedError } = advanced;
const { rows: evalRows, busy: evalBusy, progress: evalProgress, error: evalError,
  primaryStats, secondaryStats, reload: reloadEval, evaluateFiles, clear: clearEval,
  exportReport: exportEval } = evaluation;
function updateParam(key: keyof ProcessingParams, value: number): void { params[key] = value; }
</script>

<template>
  <div class="app-shell">
    <AppHeader :has-image="!!file" @reset="reset" />
    <div class="hero-strip">
      <span class="eyebrow"><span class="eyebrow-line"></span> THE IMAGE NATURALIZATION STUDIO</span>
      <span class="hero-strip-copy">MAKE AI IMAGES FEEL MORE NATURAL <ArrowDownRight :size="15" /></span>
    </div>
    <nav class="mode-switcher" aria-label="选择处理模式">
      <div class="mode-tabs" role="tablist" aria-label="基础或高级模式">
        <button class="mode-tab" :class="{ selected: mode === 'basic' }" :aria-selected="mode === 'basic'"
          role="tab" type="button" :disabled="reviewOpen" @click="selectMode('basic')">基础模式</button>
        <button class="mode-tab" :class="{ selected: mode === 'advanced' }" :aria-selected="mode === 'advanced'"
          role="tab" type="button" :disabled="reviewOpen" @click="selectMode('advanced')">高级模式</button>
      </div>
      <span class="mode-summary">{{ mode === 'basic' ? '保留原版五套方案、手动复测与导出确认' : '双模型 · 自然度诊断 · 局部画笔 · 本地评测' }}</span>
      <span class="mode-chip">{{ mode === 'basic' ? 'FAST / LOCAL' : 'ADVANCED / OPT-IN' }}</span>
    </nav>
    <main class="workbench">
      <aside class="left-rail">
        <div class="rail-heading">YOUR IMAGE <span> / 01</span></div>
        <UploadPanel :has-image="!!file" :filename="filename" :readable-size="readableSize" :width="dimensions.width"
          :height="dimensions.height" :error="uploadError" @select="selectFile" />
        <ScoreCard :has-image="!!file" :score="score" :processed-score="processedScore" :status="scanStatus"
          :processed-status="processedScanStatus" :progress="downloadProgress" :phase="scanPhase"
          :provenance="provenance" :error="scanError" :can-rescore="!!previewUrl && !isPreviewing" @rescore="rerunAssessment" />
      </aside>
      <ImageWorkspace class="center-rail" :has-image="!!file" :original-url="originalUrl" :preview-url="previewUrl"
        :filename="filename" :compare="comparePercent" :is-processing="isPreviewing" :error="previewError"
        :brush-enabled="mode === 'advanced' && brushEnabled" :brush-tool="brushTool"
        :brush-radius="brushRadius" :brush-amount="brushAmount"
        @update:compare="comparePercent = $event" @brush-stroke="addBrushStroke"
        @brush-complete="completeBrushStroke" />
      <aside class="right-rail">
        <div class="rail-heading">EDIT & EXPORT <span> / 02</span></div>
        <AdjustmentsPanel v-if="mode === 'basic'" :has-image="!!file" :preset-id="presetId" :params="params"
          :can-score="!!previewUrl && !isPreviewing" :scoring="processedScanStatus === 'loading'"
          :processed-score="processedScore" @score="rerunAssessment"
          @select-preset="selectPreset" @set-param="updateParam" />
        <AdvancedStudio v-else :has-image="!!file" :preset-id="presetId" :params="params"
          :can-score="!!previewUrl && !isPreviewing" :scoring="processedScanStatus === 'loading'"
          :processed-score="processedScore" :advanced-report="advancedReport" :advanced-busy="advancedBusy"
          :advanced-stage="advancedStage" :advanced-error="advancedError" :include-secondary="includeSecondary"
          :brush-enabled="brushEnabled" :brush-tool="brushTool" :brush-radius="brushRadius"
          :brush-amount="brushAmount" :brush-count="strokes.length" :eval-rows="evalRows"
          :eval-busy="evalBusy" :eval-progress="evalProgress" :eval-error="evalError"
          :primary-stats="primaryStats" :secondary-stats="secondaryStats"
          @select-preset="selectPreset" @set-param="updateParam" @score="rerunAssessment"
          @analyze="runAdvancedAnalysis" @update:include-secondary="includeSecondary=$event"
          @update:brush-enabled="brushEnabled=$event" @update:brush-tool="brushTool=$event"
          @update:brush-radius="brushRadius=$event" @update:brush-amount="brushAmount=$event"
          @undo-brush="undoBrush" @clear-brush="clearBrush"
          @evaluate="evaluateFiles" @reload-eval="reloadEval" @clear-eval="clearEval" @export-eval="exportEval" />
        <ExportPanel :has-image="!!file" :exporting="reviewOpen" :format="exportFormat"
          @export="reviewBeforeExport" @update:format="exportFormat = $event" />
      </aside>
    </main>
    <Teleport to="body">
      <ExportReviewDialog v-if="reviewOpen" :stage="reviewStage" :report="reviewReport" :error="reviewError"
        @close="cancelReview" @retry="retryExportReview" @confirm="confirmExportReview" />
    </Teleport>
    <footer class="site-footer">
      <div class="footer-left"><span>DeAIfy © 2026</span><span class="footer-divider"></span><span>Designed for a more natural image.</span></div>
      <div class="footer-facts"><span><LockKeyhole :size="13" /> No image upload</span><span><Cpu :size="13" /> On-device processing</span><span><Globe2 :size="13" /> Open source</span></div>
    </footer>
  </div>
</template>
