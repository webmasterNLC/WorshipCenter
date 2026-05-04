// vitest.rls.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { config } from 'dotenv';
config({ path: '.env.local' });

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/rls/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
