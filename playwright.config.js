import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 45000,
  use: {
    channel: 'chromium',
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:8787',
    trace: 'off',
    screenshot: 'off',
  },
})
