import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const host = '127.0.0.1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://${host}:${port}/Yapp/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port}`,
    url: `http://${host}:${port}/Yapp/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_FIREBASE_API_KEY: 'playwright-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'playwright.test',
      VITE_FIREBASE_DATABASE_URL: 'https://playwright-default-rtdb.firebaseio.com',
      VITE_FIREBASE_PROJECT_ID: 'playwright',
      VITE_FIREBASE_APP_ID: 'playwright-app-id',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
      VITE_E2E_MOCK_AUTH: 'true',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
