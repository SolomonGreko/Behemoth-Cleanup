import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['frontend/src/sim/__tests__/**/*.test.js'],
  },
});
