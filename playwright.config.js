// eslint-disable-next-line import/no-extraneous-dependencies
const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
  testDir: './spec/playwright',
  outputDir: './output/playwright',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3187', browserName: 'chromium',
    timezoneId: 'UTC', trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node spec/playwright/server.js',
    url: 'http://127.0.0.1:3187',
  },
  projects: [
    {name: 'chromium', testIgnore: '**/*.stress.spec.js'},
    {name: 'stress', testMatch: '**/*.stress.spec.js', timeout: 600000},
  ],
});
