import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { protectClientBundle } from './build/protectClient';
import { assertNoPrivateViteEnv, isolateVendorChunk } from './build/protectionRules';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    assertNoPrivateViteEnv({ ...process.env, ...loadEnv(mode, process.cwd(), 'VITE_') });
  }

  return {
    plugins: [vue(), ...(command === 'build' && mode === 'production' ? [protectClientBundle()] : [])],
    test: { include: ['src/**/*.test.ts'] },
    worker: {
      format: 'es',
      // Protect only our tiny image/quality Web Worker code. The large
      // Hugging Face/ONNX classifier worker includes vendor modules and is skipped.
      plugins: () => command === 'build' && mode === 'production'
        ? [protectClientBundle(process.cwd(), false)] : [],
    },
    build: {
      target: 'es2022',
      // Never expose original TypeScript or Vue source through production maps.
      sourcemap: false,
      rollupOptions: {
        output: { manualChunks: isolateVendorChunk },
      },
    },
  };
});
