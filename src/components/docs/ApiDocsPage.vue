<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight, ArrowUpRight, BookOpenText, KeyRound, ShieldCheck, Terminal } from 'lucide-vue-next';
import { paramsForPreset, PRESETS, PRESET_LEVELS } from '../../engine/presets';
import { DOWNLOAD_CURL_EXAMPLE, EXAMPLE_LANGUAGES, processingExample } from '../../docs/examples';
import type { ExampleLanguage } from '../../docs/examples';
import type { PresetId, PresetLevel } from '../../types/editor';
import CopyCode from './CopyCode.vue';

defineProps<{ commercial: boolean }>();
const emit = defineEmits<{ 'open-account': [] }>();

const sections = [
  { id: 'quickstart', label: '快速开始' },
  { id: 'authentication', label: '创建 API Key' },
  { id: 'process', label: '提交图片处理' },
  { id: 'presets', label: '预设与调用示例' },
  { id: 'download', label: '下载处理结果' },
  { id: 'errors', label: '错误码与计费' },
  { id: 'security', label: '安全与隐私' },
] as const;

const presetId = ref<PresetId>('natural');
const level = ref<PresetLevel>('medium');
const language = ref<ExampleLanguage>('curl');
const params = computed(() => paramsForPreset(presetId.value, level.value));
const paramsJson = computed(() => JSON.stringify(params.value, null, 2));
const example = computed(() => processingExample(language.value, params.value));

const responseExample = JSON.stringify({
  jobId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  downloadUrl: '/api/jobs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/download',
  wallet: { credits: 10, freeRemaining: 4, perDay: 5, day: 'YYYY-MM-DD' },
  retentionMinutes: 30,
}, null, 2);

const errors = [
  ['400', 'IDEMPOTENCY_KEY_REQUIRED', '请求缺少合法幂等键'],
  ['401', 'API_KEY_INVALID / AUTH_REQUIRED', '密钥无效、已吊销或没有认证'],
  ['402', 'NO_CREDITS', '免费次数与积分均已耗尽'],
  ['409', 'JOB_IN_PROGRESS / JOB_REVERSED', '同一幂等键的任务处理中或已退款'],
  ['410', 'RESULT_EXPIRED', '同一个任务的历史结果已过期'],
  ['422', 'INVALID_IMAGE_OR_PARAMS', '文件格式、尺寸或七项参数不合法'],
  ['422', 'PROCESSING_FAILED_AND_QUOTA_REFUNDED', '处理失败且额度已回退'],
  ['429', '请求频率限制', '稍后重试，避免并发重复提交'],
  ['503', 'JOB_STATUS_UNKNOWN 等', '结果状态不确定，禁止直接换幂等键重扣费'],
] as const;
const paramFields = [
  ['strength', '0–100', '效果强度百分比'],
  ['grain', '0–80', '颗粒质感'],
  ['warmth', '-40–40', '色温偏移'],
  ['saturation', '-40–40', '饱和度调整'],
  ['contrast', '-40–40', '对比度调整'],
  ['softness', '0–50', '柔化程度'],
  ['texture', '0–60', '纹理细节'],
] as const;
</script>

<template>
  <main class="docs-page">
    <header class="docs-hero">
      <div class="docs-kicker"><BookOpenText :size="15" /> DEVELOPER DOCUMENTATION / V1</div>
      <h1>外部 HTTP API <span>接入指南</span></h1>
      <p>把 DeAIfy 图片自然化能力集成进你的 Java、Python、Node.js 服务。按照下面的步骤配置密钥、上传图片、下载结果。</p>
      <div class="docs-tags"><span>REST API</span><span>HTTPS</span><span>项目密钥</span><span>积分计量</span></div>
    </header>

    <div class="docs-layout">
      <aside class="docs-nav" aria-label="文档目录">
        <div class="docs-nav-inner">
          <div class="docs-nav-title">文档目录</div>
          <a v-for="(section, index) in sections" :key="section.id" :href="'#' + section.id">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>{{ section.label }}
          </a>
          <div class="docs-nav-divider"></div>
          <a href="https://github.com/While-Shark/DeAIfy/blob/master/docs/external-http-api.md"
            target="_blank" rel="noopener noreferrer">GitHub 源文档 <ArrowUpRight :size="14" /></a>
        </div>
      </aside>

      <article class="docs-content">
        <div v-if="!commercial" class="docs-notice" role="note">
          <ShieldCheck :size="20" />
          <div><strong>当前站点未启用 VPS 商用 API</strong>
            <p>你仍可阅读完整文档。实际调用需要先部署 DeAIfy 的商用 API 服务，并使用自己的 HTTPS API 地址；普通静态网页域名不提供这些接口。</p>
          </div>
        </div>

        <section id="quickstart" class="doc-section">
          <div class="doc-section-kicker">01 / GET STARTED</div>
          <h2>快速开始</h2>
          <p>无需另建 MCP 服务，标准 HTTP 客户端即可对接。建议在你的<strong>服务端</strong>发送请求。</p>
          <ol class="doc-steps">
            <li><strong>准备 VPS API 地址</strong><p>完成商用后端部署，确认 <code>https://你的API域名/health</code> 返回正常。地址不是普通 Vercel 静态站域名。</p></li>
            <li><strong>生成 API Key</strong><p>登录 DeAIfy → 账户 / 积分 → API 密钥 → 填写项目名 → 创建并保存密钥。</p></li>
            <li><strong>调用图片处理接口</strong><p>上传 JPG、PNG 或 WebP 原图，提供七项处理参数及唯一幂等键。</p></li>
            <li><strong>获取处理结果</strong><p>拿到 <code>jobId</code> 和 <code>downloadUrl</code>，使用同一密钥下载文件。</p></li>
          </ol>
          <button v-if="commercial" type="button" class="docs-primary" @click="emit('open-account')">
            打开账户并创建密钥 <ArrowRight :size="17" />
          </button>
        </section>

        <section id="authentication" class="doc-section">
          <div class="doc-section-kicker">02 / AUTHENTICATION</div>
          <h2>创建与管理 API Key</h2>
          <p>账号须先登录；点击顶部「账户 / 积分」里的「API 密钥」。每个项目可创建单独的密钥，例如 <code>IdeaWeave</code>。</p>
          <div class="docs-facts">
            <div><KeyRound :size="19" /><strong>仅展示一次</strong><span>创建后立刻复制保存，之后只能吊销并重新生成。</span></div>
            <div><ShieldCheck :size="19" /><strong>服务端保管</strong><span>放入服务器环境变量或 Secret Manager，不要写进前端。</span></div>
          </div>
          <div class="docs-inline-code"><span>Authorization</span><code>Bearer dak_&lt;64位十六进制字符串&gt;</code></div>
          <p class="docs-minor">一个账号最多保留 5 个有效密钥；API 密钥不能创建/吊销其他密钥，管理接口只接受网页登录会话 Token。</p>
          <h3>密钥管理接口</h3>
          <div class="docs-table-wrap"><table class="docs-table">
            <thead><tr><th>方法</th><th>路径</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td>POST</td><td><code>/api/account/api-keys</code></td><td>JSON: <code>{"project":"IdeaWeave"}</code>；返回一次密钥明文</td></tr>
              <tr><td>GET</td><td><code>/api/account/api-keys</code></td><td>查看名称、ID、创建及吊销时间</td></tr>
              <tr><td>DELETE</td><td><code>/api/account/api-keys/:id</code></td><td>立即吊销指定密钥</td></tr>
            </tbody>
          </table></div>
        </section>

        <section id="process" class="doc-section">
          <div class="doc-section-kicker">03 / IMAGE PROCESSING</div>
          <h2><span class="docs-method">POST</span> /api/process</h2>
          <p>请求类型：<code>multipart/form-data</code>。示例默认处理一张 JPG，可修改输出为 PNG 或 WebP。</p>
          <div class="docs-table-wrap"><table class="docs-table">
            <thead><tr><th>字段</th><th>要求</th><th>用途</th></tr></thead>
            <tbody>
              <tr><td><code>Authorization</code></td><td>必填 Header</td><td><code>Bearer dak_...</code></td></tr>
              <tr><td><code>Idempotency-Key</code></td><td>必填 Header</td><td>16–80 位字母、数字、下划线或连字符；同一任务重试保持一致</td></tr>
              <tr><td><code>image</code></td><td>必填文件</td><td>JPG / PNG / WebP；不超过 25 MiB、3000 万像素</td></tr>
              <tr><td><code>params</code></td><td>必填 JSON 字符串</td><td>包含全部七项自然化参数</td></tr>
              <tr><td><code>format</code></td><td>必填字段</td><td><code>image/jpeg</code>、<code>image/png</code> 或 <code>image/webp</code></td></tr>
            </tbody>
          </table></div>
          <p class="docs-minor">服务器端目前不接受 <code>preset: "natural"</code> 或 <code>level: "high"</code> 这样的字段，必须换算为下面的七项数值参数。</p>
          <h3>params 必填字段范围</h3>
          <div class="docs-table-wrap"><table class="docs-table">
            <thead><tr><th>参数</th><th>数值范围</th><th>含义</th></tr></thead>
            <tbody><tr v-for="field in paramFields" :key="field[0]">
              <td><code>{{ field[0] }}</code></td><td>{{ field[1] }}</td><td>{{ field[2] }}</td>
            </tr></tbody>
          </table></div>
        </section>

        <section id="presets" class="doc-section">
          <div class="doc-section-kicker">04 / LIVE EXAMPLES</div>
          <h2>预设参数与调用示例</h2>
          <p>选择自然化方案和强度后，下方 JSON 和调用代码会同步更新，可直接复制到你自己的后端项目中。</p>
          <div class="docs-preset-controls">
            <label>自然化方案
              <select v-model="presetId" aria-label="文档预设">
                <option v-for="preset in PRESETS" :key="preset.id" :value="preset.id">{{ preset.title }}</option>
              </select>
            </label>
            <label>处理强度
              <select v-model="level" aria-label="文档强度">
                <option v-for="presetLevel in PRESET_LEVELS" :key="presetLevel.id" :value="presetLevel.id">{{ presetLevel.label }}</option>
              </select>
            </label>
          </div>
          <CopyCode :code="paramsJson" label="params · 7 项数值参数" />
          <div class="docs-example-heading"><h3><Terminal :size="18" /> 完整调用示例</h3>
            <div class="docs-example-tabs" role="group" aria-label="示例语言">
              <button v-for="item in EXAMPLE_LANGUAGES" :key="item.id" type="button"
                :aria-pressed="language === item.id" :class="{ active: language === item.id }"
                @click="language = item.id">{{ item.label }}</button>
            </div>
          </div>
          <CopyCode :code="example" :label="language === 'curl' ? 'Bash / cURL' : language === 'node' ? 'Node.js 22+' : 'Python 3 + requests'" />
          <p class="docs-minor">将环境变量 <code>DEAIFY_API_URL</code> 指向你的 HTTPS API 域名，将 <code>DEAIFY_API_KEY</code> 设置为创建的密钥。示例使用 <code>sample.jpg</code>，请替换为实际文件。cURL 示例适用于 Bash。</p>
        </section>

        <section id="download" class="doc-section">
          <div class="doc-section-kicker">05 / RESULT</div>
          <h2><span class="docs-method docs-method-get">GET</span> /api/jobs/:id/download</h2>
          <p>处理成功后返回 HTTP <code>201</code>，响应中包含任务 ID 和相对下载地址：</p>
          <CopyCode :code="responseExample" label="POST /api/process · 201 响应示例" />
          <p>将下载路径拼到同一个 API 域名，带上 API Key 获取图片文件。通常可以在成功处理后的 30 分钟内重复下载，不重复扣费。</p>
          <CopyCode :code="DOWNLOAD_CURL_EXAMPLE" label="Bash / 下载结果" />
        </section>

        <section id="errors" class="doc-section">
          <div class="doc-section-kicker">06 / ERROR HANDLING</div>
          <h2>错误码、幂等与积分</h2>
          <div class="docs-table-wrap"><table class="docs-table">
            <thead><tr><th>HTTP</th><th>错误码</th><th>处理建议</th></tr></thead>
            <tbody><tr v-for="item in errors" :key="item[0] + item[1]">
              <td>{{ item[0] }}</td><td><code>{{ item[1] }}</code></td><td>{{ item[2] }}</td>
            </tr></tbody>
          </table></div>
          <div class="docs-note"><strong>积分规则</strong><p>每次成功处理消耗当天免费额度或 1 积分；已明确失败的任务会尝试退款。请求超时或收到 503 时，服务端可能仍在处理或已扣费，必须保留同一个幂等键并核查任务状态，不能直接使用新键重试。</p></div>
        </section>

        <section id="security" class="doc-section">
          <div class="doc-section-kicker">07 / SECURITY</div>
          <h2>安全、隐私与限制</h2>
          <ul class="docs-checklist">
            <li>只在服务端发送带 API Key 的请求，不在前端 Vue/React、浏览器插件或公开仓库存储密钥。</li>
            <li>外部 API 调用会把图片明确上传到你配置的 VPS；本地预览仍在浏览器 Worker 中处理。</li>
            <li>结果在 VPS 上临时加密保存，约 30 分钟过期；接口不可用于长期文件存储。</li>
            <li>当前项目名只是密钥标签，并非租户隔离。同一账号的密钥共享积分及账号内任务权限；需要强隔离请使用不同账号。</li>
            <li>处理仅调整图像外观，不保证消除 C2PA、SynthID 或第三方平台 AI 标识，请遵循内容披露要求。</li>
          </ul>
          <p class="docs-minor">初次对外开放前请完成 VPS HTTPS、数据库迁移、反向代理、访问频控及密钥吊销联调。MCP 仅作为可选上层适配，不需要为接入 HTTP API 单独部署。</p>
        </section>
      </article>
    </div>
  </main>
</template>
