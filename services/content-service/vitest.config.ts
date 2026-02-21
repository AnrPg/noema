/**
 * @noema/content-service — Vitest Configuration
 *
 * Unit tests: tests/unit/    — pure logic, no I/O, all deps mocked
 * Integration tests: tests/integration/ — Fastify routes + real validation (DB mocked)
 * Contract tests: tests/contract/       — API contract verification
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: '.',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts', // bootstrap / DI wiring
        'src/**/index.ts', // barrel exports
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    sequence: {
      shuffle: true,
    },
  },
});
