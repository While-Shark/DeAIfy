import { describe, expect, it } from 'vitest';
import { assertNoPrivateViteEnv, isolateVendorChunk, shouldProtectChunk } from '../../build/protectionRules';

describe('production client protection policy', () => {
  const root = '/repo/deaify';

  it('protects first-party chunks, but not vendor or mixed chunks', () => {
    expect(shouldProtectChunk({ '/repo/deaify/src/App.vue': {} }, root)).toBe(true);
    expect(shouldProtectChunk({ '/repo/deaify/src/engine/pixels.ts': {} }, root)).toBe(true);
    expect(shouldProtectChunk({ '/repo/deaify/node_modules/vue/dist/vue.runtime.esm.js': {} }, root)).toBe(false);
    expect(shouldProtectChunk({
      '/repo/deaify/src/App.vue': {},
      '/repo/deaify/node_modules/vue/dist/vue.runtime.esm.js': {},
    }, root)).toBe(false);
    expect(shouldProtectChunk({ '/repo/deaify-other/src/App.vue': {} }, root)).toBe(false);
  });

  it('isolates vendor code, including C2PA, from app chunks', () => {
    expect(isolateVendorChunk('/repo/node_modules/vue/dist/vue.js')).toBe('vendor-runtime');
    expect(isolateVendorChunk('/repo/node_modules/@contentauth/c2pa-web/dist/index.js'))
      .toBe('vendor-provenance');
    expect(isolateVendorChunk('/repo/src/workers/image.worker.ts')).toBeUndefined();
  });

  it('blocks accidentally public merchant and security secrets', () => {
    for (const key of [
      'VITE_XUNHU_SECRET', 'VITE_MYSQL_PASSWORD', 'VITE_PROCESSOR_SHARED_TOKEN',
      'VITE_SMTP_PASSWORD', 'VITE_OTP_SECRET', 'VITE_RESULT_ENCRYPTION_KEY_HEX',
    ]) {
      expect(() => assertNoPrivateViteEnv({ [key]: 'never-public' })).toThrow(key);
    }
    expect(() => assertNoPrivateViteEnv({
      VITE_TURNSTILE_SITE_KEY: 'public-site-key',
      VITE_COMMERCIAL_API_URL: 'https://api.example.com',
    })).not.toThrow();
  });
});
