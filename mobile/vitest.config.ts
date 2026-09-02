import { defineConfig } from 'vitest/config';

/** The rules engines are pure TypeScript, so they test in plain node — no
 *  React Native runtime, no jsdom. Screens are verified separately by driving
 *  the exported web build. */
export default defineConfig({
  test: {
    include: ['src/game/**/*.test.ts'],
    environment: 'node',
  },
});
