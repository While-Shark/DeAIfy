<script setup lang="ts">
import { ArrowDownRight, Cpu, Globe2, LockKeyhole } from 'lucide-vue-next';
import AppHeader from './components/AppHeader.vue';
import UploadPanel from './components/UploadPanel.vue';
import ScoreCard from './components/ScoreCard.vue';
import QualityPanel from './components/QualityPanel.vue';
import ImageWorkspace from './components/ImageWorkspace.vue';
import AdjustmentsPanel from './components/AdjustmentsPanel.vue';
import ExportPanel from './components/ExportPanel.vue';
import ExportReviewDialog from './components/ExportReviewDialog.vue';
import { useEditor } from './composables/useEditor';
import type { ProcessingParams } from './types/editor';

const {
  file, filename, readableSize, originalUrl, previewUrl, dimensions, params, presetId,
  comparePercent, score, processedScore, scanStatus, processedScanStatus, downloadProgress,
  scanPhase, provenance, uploadError, scanError, previewError, isPreviewing,
  sourceQuality, processedQuality, sourceQualityStatus, processedQualityStatus,
  sourceQualityError, processedQualityError,
  canPreviewScore, exportFormat, selectFile, selectPreset, rerunAssessment, reviewBeforeExport, reset,
  reviewOpen, reviewStage, reviewReport, reviewError, retryExportReview, confirmExportReview, cancelReview,
} = useEditor();

function updateParam(key: keyof ProcessingParams, value: number): void {
  params[key] = value;
}
</script>

<template>
  <div class="app-shell">
    <AppHeader :has-image="!!file" @reset="reset" />
    <div class="hero-strip">
      <span class="eyebrow"><span class="eyebrow-line"></span> THE IMAGE NATURALIZATION STUDIO</span>
      <span class="hero-strip-copy">MAKE AI IMAGES FEEL MORE NATURAL <ArrowDownRight :size="15" /></span>
    </div>
    <main class="workbench">
      <aside class="left-rail">
        <div class="rail-heading">YOUR IMAGE <span> / 01</span></div>
        <UploadPanel :has-image="!!file" :filename="filename" :readable-size="readableSize"
          :width="dimensions.width" :height="dimensions.height" :error="uploadError" @select="selectFile" />
        <ScoreCard :has-image="!!file" :score="score" :processed-score="processedScore"
          :status="scanStatus" :processed-status="processedScanStatus" :progress="downloadProgress"
          :phase="scanPhase" :provenance="provenance" :error="scanError"
          :can-rescore="canPreviewScore && processedQualityStatus !== 'loading'"
          @rescore="rerunAssessment" />
        <QualityPanel :has-image="!!file" :source="sourceQuality" :processed="processedQuality"
          :source-status="sourceQualityStatus" :processed-status="processedQualityStatus"
          :source-error="sourceQualityError" :processed-error="processedQualityError" />
      </aside>
      <ImageWorkspace class="center-rail" :has-image="!!file" :original-url="originalUrl"
        :preview-url="previewUrl" :filename="filename" :compare="comparePercent"
        :is-processing="isPreviewing" :error="previewError"
        @update:compare="comparePercent = $event" />
      <aside class="right-rail">
        <div class="rail-heading">EDIT & EXPORT <span> / 02</span></div>
        <AdjustmentsPanel :has-image="!!file" :preset-id="presetId" :params="params"
          :can-score="canPreviewScore" :scoring="processedScanStatus === 'loading' || processedQualityStatus === 'loading'"
          :processed-score="processedScore" @score="rerunAssessment"
          @select-preset="selectPreset" @set-param="updateParam" />
        <ExportPanel :has-image="!!file" :exporting="reviewOpen" :format="exportFormat"
          @export="reviewBeforeExport" @update:format="exportFormat = $event" />
      </aside>
    </main>
    <Teleport to="body">
      <ExportReviewDialog v-if="reviewOpen" :stage="reviewStage" :report="reviewReport"
        :error="reviewError" @close="cancelReview"
        @retry="retryExportReview" @confirm="confirmExportReview" />
    </Teleport>
    <footer class="site-footer">
      <div class="footer-left"><span>DeAIfy © 2026</span><span class="footer-divider"></span><span>Designed for a more natural image.</span></div>
      <div class="footer-facts"><span><LockKeyhole :size="13" /> No image upload</span><span><Cpu :size="13" /> On-device processing</span><span><Globe2 :size="13" /> Open source</span></div>
    </footer>
  </div>
</template>
