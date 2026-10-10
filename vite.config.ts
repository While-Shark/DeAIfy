import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: { include: ['src/**/*.test.ts'] },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
