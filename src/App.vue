<script setup lang="ts">
import { ArrowDownRight, Cpu, Globe2, LockKeyhole } from 'lucide-vue-next';
import { ref, onMounted } from 'vue';
import { useCommerce } from './composables/useCommerce';
import CommerceDrawer from './components/CommerceDrawer.vue';
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

const commerce = useCommerce();
const accountOpen = ref(false);
onMounted(() => { void commerce.initialize(); });
const {
  file, filename, readableSize, originalUrl, previewUrl, dimensions, params, presetId,
  comparePercent, score, processedScore, scanStatus, processedScanStatus, downloadProgress,
  scanPhase, provenance, uploadError, scanError, previewError, isPreviewing,
  sourceQuality, processedQuality, sourceQualityStatus, processedQualityStatus,
  sourceQualityError, processedQualityError,
  canPreviewScore, exportFormat, selectFile, selectPreset, rerunAssessment, reviewBeforeExport, reset,
  reviewOpen, reviewStage, reviewReport, reviewError, retryExportReview, confirmExportReview, cancelReview,
} = useEditor();

function handleExport():void {
  if(commerce.enabled){
    if(!commerce.authenticated.value){accountOpen.value=true;return;}
    const remaining=commerce.wallet.value?.freeRemaining??0;
    const credits=commerce.wallet.value?.credits??0;
    if(remaining<1&&credits<1){accountOpen.value=true;return;}
    const charge=remaining>0?'使用今日 1 次免费额度':'消耗 1 积分';
    if(!window.confirm('确认'+charge+'？将临时上传图片到 VPS 进行完整分辨率处理。成功后扣费，结果保存约 30 分钟。'))return;
  }
  reviewBeforeExport();
}
function updateParam(key: keyof ProcessingParams, value: number): void {
  params[key] = value;
}
</script>

<template>
  <div class="app-shell">
    <AppHeader :has-image="!!file" :commercial="commerce.enabled" @account="accountOpen=true" @reset="reset" />
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
          @export="handleExport" @update:format="exportFormat = $event" />
      </aside>
    </main>
    <CommerceDrawer v-if="commerce.enabled" :open="accountOpen" @close="accountOpen=false" />
    <Teleport to="body">
      <ExportReviewDialog v-if="reviewOpen" :stage="reviewStage" :report="reviewReport"
        :error="reviewError" @close="cancelReview"
        @retry="retryExportReview" @confirm="confirmExportReview" />
    </Teleport>
    <footer class="site-footer">
      <div class="footer-left"><span>DeAIfy © 2026</span><span class="footer-divider"></span><span>Designed for a more natural image.</span></div>
      <div class="footer-facts"><span><LockKeyhole :size="13" /> {{ commerce.enabled ? 'Preview locally · Export on VPS' : 'No image upload' }}</span><span><Cpu :size="13" /> {{ commerce.enabled ? 'Protected processing' : 'On-device processing' }}</span><span><Globe2 :size="13" /> Open source</span></div>
    </footer>
  </div>
</template>
