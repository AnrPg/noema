import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  skipNodeModulesBundle: true,
  // Use rollup for DTS to avoid TypeScript project issues
  experimentalDts: false,
});
