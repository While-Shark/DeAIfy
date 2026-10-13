import type { ProcessingParams } from '../types/editor';

export type ExampleLanguage = 'curl' | 'node' | 'python';
export const EXAMPLE_LANGUAGES: readonly { id: ExampleLanguage; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python' },
];

/** Samples use the validated seven-field preset; the API does not accept preset IDs. */
export function processingExample(language: ExampleLanguage, params: ProcessingParams): string {
  const json = JSON.stringify(params);
  if (language === 'curl') {
    return [
      '# Bash: 先设置 DEAIFY_API_URL 和 DEAIFY_API_KEY 环境变量',
      '# 每张图片使用新的 JOB_KEY；超时重试务必保留同一个值',
      'JOB_KEY="request_$(openssl rand -hex 16)"',
      'curl --fail-with-body -sS -X POST "$DEAIFY_API_URL/api/process" \\',
      '  -H "Authorization: Bearer $DEAIFY_API_KEY" \\',
      '  -H "Idempotency-Key: $JOB_KEY" \\',
      '  -F "image=@sample.jpg;type=image/jpeg" \\',
      "  -F 'format=image/jpeg' \\",
      "  -F 'params=" + json + "'",
    ].join('\n');
  }
  if (language === 'node') {
    return [
      "// Node.js 22+；在服务端设置 DEAIFY_API_URL / DEAIFY_API_KEY",
      "import { randomUUID } from 'node:crypto';",
      "import { readFile, writeFile } from 'node:fs/promises';",
      '',
      "const base = (process.env.DEAIFY_API_URL || '').replace(/\\/+$/, '');",
      'const token = process.env.DEAIFY_API_KEY;',
      "if (!base || !token) throw new Error('Missing DeAIfy configuration');",
      '// 生产环境应持久化 jobKey，重试不能生成新 Key',
      "const jobKey = process.env.DEAIFY_JOB_KEY || 'request_' + randomUUID().replaceAll('-', '');",
      'const form = new FormData();',
      "form.set('image', new Blob([await readFile('sample.jpg')], { type: 'image/jpeg' }), 'sample.jpg');",
      "form.set('format', 'image/jpeg');",
      "form.set('params', JSON.stringify(" + json + '));',
      '',
      "const response = await fetch(base + '/api/process', {",
      "  method: 'POST',",
      "  headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': jobKey },",
      '  body: form,',
      '});',
      "if (!response.ok) throw new Error('Process failed: ' + response.status + ' ' + await response.text());",
      'const { downloadUrl } = await response.json();',
      "const result = await fetch(base + downloadUrl, { headers: { Authorization: 'Bearer ' + token } });",
      "if (!result.ok) throw new Error('Download failed: ' + result.status);",
      "await writeFile('result.jpg', Buffer.from(await result.arrayBuffer()));",
    ].join('\n');
  }
  return [
    '# pip install requests',
    'import json, os, secrets',
    'from pathlib import Path',
    'import requests',
    '',
    'base = os.environ["DEAIFY_API_URL"].rstrip("/")',
    'token = os.environ["DEAIFY_API_KEY"]',
    '# 生产环境应持久化 job_key；重试时复用',
    'job_key = os.getenv("DEAIFY_JOB_KEY", "request_" + secrets.token_hex(16))',
    'headers = {"Authorization": "Bearer " + token, "Idempotency-Key": job_key}',
    'with open("sample.jpg", "rb") as image:',
    '    response = requests.post(base + "/api/process", headers=headers,',
    '        files={"image": ("sample.jpg", image, "image/jpeg")},',
    '        data={"format": "image/jpeg", "params": json.dumps(' + json + ')}, timeout=60)',
    'response.raise_for_status()',
    'download_url = response.json()["downloadUrl"]',
    'result = requests.get(base + download_url,',
    '    headers={"Authorization": "Bearer " + token}, timeout=60)',
    'result.raise_for_status()',
    'Path("result.jpg").write_bytes(result.content)',
  ].join('\n');
}

export const DOWNLOAD_CURL_EXAMPLE = [
  '# 将 JOB_ID 替换为处理接口返回的 jobId',
  'curl --fail-with-body -sS \\',
  '  -H "Authorization: Bearer $DEAIFY_API_KEY" \\',
  '  "$DEAIFY_API_URL/api/jobs/JOB_ID/download" \\',
  '  -o result.jpg',
].join('\n');
