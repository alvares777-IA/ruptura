const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright — Testes E2E
 *
 * Variáveis de ambiente:
 *   BASE_URL      URL base do servidor (padrão: http://localhost:3000)
 *   TEST_EMAIL    Email do usuário de teste
 *   TEST_PASSWORD Senha do usuário de teste
 *
 * Para rodar: npx playwright test
 * Para ver relatório: npx playwright show-report
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Inicia o servidor automaticamente se não estiver rodando
  // webServer: {
  //   command: 'npm start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: true,
  // },
});
