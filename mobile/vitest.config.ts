import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const stub = (name: string) =>
  fileURLToPath(new URL(`./src/auth/__stubs__/${name}.ts`, import.meta.url));

/** The rules engines are pure TypeScript, so they test in plain node — no
 *  React Native runtime, no jsdom. Screens are verified separately by driving
 *  the exported web build. */
export default defineConfig({
  test: {
    include: ['src/game/**/*.test.ts', 'src/auth/**/*.test.ts', 'src/theme/**/*.test.ts', 'plugins/**/*.test.ts'],
    environment: 'node',
    // The keystore adapter is the auth module's one platform import, and it
    // pulls in React Native, which does not parse in a node environment.
    alias: { './storage': stub('storage') },
  },
});
