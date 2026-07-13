import { defineConfig, devices } from '@playwright/test';

/**
 * Hamba Customer Service — Playwright E2E config
 *
 * Headed by default so you can watch the browser click through flows.
 * HTML reporter generates a clickable report with screenshots at every step.
 *
 * Run `npm run test:e2e`         — visible browser + HTML report
 * Run `npm run test:e2e:ci`      — headless + JSON report
 * Run `npm run test:e2e:report`  — open the last HTML report
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // sequential so you can follow along visually
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // single worker for visible execution
  timeout: 60_000, // longer timeout for slow visible runs

  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'e2e/results.json' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    // `npm run dev` serves this app on 3001 (3000 belongs to SAChatbot — see
    // start-all.sh). E2E_BASE_URL still overrides for other setups.
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    headless: !!process.env.CI,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    trace: 'on',
    screenshot: 'on', // screenshot after EVERY action — shows up in the HTML report
    video: 'on-first-retry',

    // Slow down every Playwright action by 2500ms so you can really watch each step
    launchOptions: {
      slowMo: process.env.CI ? 0 : 2500,
    },

    // Local auth bypass — the app skips Supabase auth when this is set
    extraHTTPHeaders: {},
  },

  projects: [
    {
      name: 'local',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
      },
    },
    {
      name: 'vercel',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.VERCEL_URL || 'https://hamba-customer-service.vercel.app',
      },
    },
  ],

  /* Start the dev server automatically when running local tests */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        port: 3000,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
