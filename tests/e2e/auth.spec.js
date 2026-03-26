/**
 * Testes E2E — Autenticação
 *
 * Cobre: exibição do formulário, credenciais inválidas, login bem-sucedido,
 *        toggle de senha, proteção de rotas e logout.
 *
 * Pré-requisito: servidor rodando em BASE_URL (padrão http://localhost:3000)
 * Variáveis de ambiente:
 *   TEST_EMAIL    — email de um usuário ativo no banco (ex: admin@empresa.com)
 *   TEST_PASSWORD — senha correspondente
 *
 * Para rodar: npx playwright test tests/e2e/auth.spec.js
 */

const { test, expect } = require('@playwright/test');

const EMAIL = process.env.TEST_EMAIL    || 'admin@empresa.com';
const SENHA  = process.env.TEST_PASSWORD || 'senha123';

// ─────────────────────────────────────────────────────────────────────────────
// Página de login
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Página de login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('exibe formulário com campos e botão de submit', async ({ page }) => {
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="senha"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('exibe opção de login com Google', async ({ page }) => {
    await expect(page.locator('a[href="/auth/google"]')).toBeVisible();
  });

  test('exibe mensagem de erro com credenciais inválidas', async ({ page }) => {
    await page.fill('input[name="email"]', 'nao@existe.com');
    await page.fill('input[name="senha"]', 'senhaerrada');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert.alert-danger')).toBeVisible();
  });

  test('não redireciona com e-mail válido mas senha errada', async ({ page }) => {
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="senha"]', 'senhamuiterrada');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('.alert.alert-danger')).toBeVisible();
  });

  test('redireciona para /dashboard com credenciais válidas', async ({ page }) => {
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="senha"]', SENHA);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('toggle exibe e oculta a senha', async ({ page }) => {
    const input = page.locator('#senhaInput');
    await expect(input).toHaveAttribute('type', 'password');

    await page.click('#toggleSenha');
    await expect(input).toHaveAttribute('type', 'text');

    await page.click('#toggleSenha');
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('ícone do toggle muda junto com o tipo do campo', async ({ page }) => {
    const icon = page.locator('#eyeIcon');
    await expect(icon).toHaveClass(/bi-eye$/);

    await page.click('#toggleSenha');
    await expect(icon).toHaveClass(/bi-eye-slash/);
  });

  test('usuário já autenticado é redirecionado para /dashboard', async ({ page }) => {
    // Faz login
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="senha"]', SENHA);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // Tenta acessar /login novamente
    await page.goto('/login');
    await expect(page).toHaveURL('/dashboard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Proteção de rotas (redirect para /login)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Rotas protegidas — sem autenticação', () => {
  test.each([
    ['/dashboard',           'dashboard'],
    ['/produtos/registro',   'registro de produtos'],
    ['/produtos/lista',      'lista de produtos'],
    ['/admin/usuarios',      'admin usuários'],
    ['/admin/clientes',      'admin clientes'],
    ['/relatorios',          'relatórios'],
  ])('GET %s redireciona para /login', async ({ page }, [rota]) => {
    await page.goto(rota);
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Logout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="senha"]', SENHA);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('GET /logout redireciona para /login', async ({ page }) => {
    await page.goto('/logout');
    await expect(page).toHaveURL(/\/login/);
  });

  test('após logout, /dashboard redireciona novamente para /login', async ({ page }) => {
    await page.goto('/logout');
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('sessão é invalidada: API retorna 401 após logout', async ({ page }) => {
    await page.goto('/logout');
    const response = await page.request.get('/api/produtos/lista?id_cliente=1');
    // Deve redirecionar ou retornar 401/302
    expect([302, 401, 403]).toContain(response.status());
  });
});
