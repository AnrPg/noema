import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['NOEMA_WEB_E2E_PORT'] ?? 3000);
const baseURL = process.env['NOEMA_WEB_E2E_BASE_URL'] ?? `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env['CI'] === 'true' ? 2 : 0,
  reporter: process.env['CI'] === 'true' ? [['html'], ['github']] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `node ../../scripts/ensure-next-middleware-manifest.cjs && pnpm exec next dev --port ${String(port)}`,
    url: baseURL,
    reuseExistingServer: process.env['CI'] !== 'true',
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
