/**
 * Testes E2E — Registro de Produtos
 *
 * Cobre: estado inicial do formulário, habilitação do botão Validar,
 *        fluxo de sucesso (produto encontrado), fluxo de erro (ERP),
 *        acionamento por Enter, visibilidade do scanner e API de quantidade.
 *
 * Nota: chamadas à API /api/produtos/validar são interceptadas com
 * page.route() para não depender de ERP real.
 *
 * Pré-requisito: servidor rodando; usuário de teste com pelo menos 1 cliente.
 * Variáveis de ambiente: TEST_EMAIL, TEST_PASSWORD
 *
 * Para rodar: npx playwright test tests/e2e/produtos.spec.js
 */

const { test, expect } = require('@playwright/test');

const EMAIL = process.env.TEST_EMAIL    || 'admin@empresa.com';
const SENHA  = process.env.TEST_PASSWORD || 'senha123';

// ─── Helper de autenticação ──────────────────────────────────────────────────
async function login(page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="senha"]', SENHA);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
}

// Resposta de sucesso da API de validação
const PRODUTO_OK = {
  ok: true,
  produto: { descricao: 'LEITE INTEGRAL 1L', dados: { preco: 4.99 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// Estrutura da página
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Página de registro de produtos — estrutura', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/produtos/registro');
  });

  test('exibe select de cliente', async ({ page }) => {
    await expect(page.locator('#selCliente')).toBeVisible();
  });

  test('exibe campo de código EAN', async ({ page }) => {
    await expect(page.locator('#inputCodigo')).toBeVisible();
  });

  test('exibe campo de quantidade (opcional)', async ({ page }) => {
    await expect(page.locator('#inputQtd')).toBeVisible();
  });

  test('exibe botão Validar', async ({ page }) => {
    await expect(page.locator('#btnValidar')).toBeVisible();
  });

  test('exibe botão de câmera', async ({ page }) => {
    await expect(page.locator('#btnCamera')).toBeVisible();
  });

  test('container da câmera começa oculto', async ({ page }) => {
    await expect(page.locator('#readerContainer')).toHaveClass(/d-none/);
  });

  test('área de resultado começa oculta', async ({ page }) => {
    await expect(page.locator('#resultado')).toHaveClass(/d-none/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Estado do botão Validar
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Botão Validar — habilitação', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/produtos/registro');
  });

  test('começa desabilitado', async ({ page }) => {
    await expect(page.locator('#btnValidar')).toBeDisabled();
  });

  test('continua desabilitado com apenas código preenchido', async ({ page }) => {
    await page.fill('#inputCodigo', '7891000100103');
    await expect(page.locator('#btnValidar')).toBeDisabled();
  });

  test('continua desabilitado com apenas cliente selecionado', async ({ page }) => {
    const count = await page.locator('#selCliente option').count();
    if (count <= 1) return test.skip();
    await page.selectOption('#selCliente', { index: 1 });
    await expect(page.locator('#btnValidar')).toBeDisabled();
  });

  test('habilita quando cliente e código estão preenchidos', async ({ page }) => {
    const count = await page.locator('#selCliente option').count();
    if (count <= 1) return test.skip();
    await page.selectOption('#selCliente', { index: 1 });
    await page.fill('#inputCodigo', '7891000100103');
    await expect(page.locator('#btnValidar')).toBeEnabled();
  });

  test('volta a desabilitar ao limpar o código', async ({ page }) => {
    const count = await page.locator('#selCliente option').count();
    if (count <= 1) return test.skip();
    await page.selectOption('#selCliente', { index: 1 });
    await page.fill('#inputCodigo', '7891000100103');
    await page.fill('#inputCodigo', '');
    await expect(page.locator('#btnValidar')).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fluxo de validação — sucesso
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Validação de produto — sucesso', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/produtos/registro');
  });

  async function prepararValidacao(page) {
    const count = await page.locator('#selCliente option').count();
    if (count <= 1) return false;
    await page.selectOption('#selCliente', { index: 1 });
    await page.fill('#inputCodigo', '7891000100103');

    await page.route('/api/produtos/validar', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PRODUTO_OK),
      })
    );
    return true;
  }

  test('exibe card de resultado após validação bem-sucedida', async ({ page }) => {
    if (!(await prepararValidacao(page))) return test.skip();
    await page.click('#btnValidar');
    await expect(page.locator('#resultado')).not.toHaveClass(/d-none/);
  });

  test('exibe código do produto no resultado', async ({ page }) => {
    if (!(await prepararValidacao(page))) return test.skip();
    await page.click('#btnValidar');
    await expect(page.locator('#resCodigo')).toHaveText('7891000100103');
  });

  test('exibe descrição do produto no resultado', async ({ page }) => {
    if (!(await prepararValidacao(page))) return test.skip();
    await page.click('#btnValidar');
    await expect(page.locator('#resDescricao')).toHaveText(PRODUTO_OK.produto.descricao);
  });

  test('limpa campo de código após validação', async ({ page }) => {
    if (!(await prepararValidacao(page))) return test.skip();
    await page.click('#btnValidar');
    await expect(page.locator('#inputCodigo')).toHaveValue('');
  });

  test('limpa campo de quantidade após validação', async ({ page }) => {
    if (!(await prepararValidacao(page))) return test.skip();
    await page.fill('#inputQtd', '10');
    await page.click('#btnValidar');
    await expect(page.locator('#inputQtd')).toHaveValue('');
  });

  test('Enter no campo de código dispara validação', async ({ page }) => {
    if (!(await prepararValidacao(page))) return test.skip();
    await page.press('#inputCodigo', 'Enter');
    await expect(page.locator('#resultado')).not.toHaveClass(/d-none/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fluxo de validação — erro
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Validação de produto — erro', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/produtos/registro');
  });

  async function prepararEValidarComErro(page, status, msg) {
    const count = await page.locator('#selCliente option').count();
    if (count <= 1) return false;
    await page.selectOption('#selCliente', { index: 1 });
    await page.fill('#inputCodigo', '0000000000000');

    await page.route('/api/produtos/validar', (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, msg }),
      })
    );
    await page.click('#btnValidar');
    return true;
  }

  test('exibe toast de erro quando produto não é encontrado no ERP', async ({ page }) => {
    if (!(await prepararEValidarComErro(page, 404, 'Produto nao encontrado no ERP.'))) {
      return test.skip();
    }
    await expect(page.locator('#toastErro')).toBeVisible();
    await expect(page.locator('#toastErroMsg')).toHaveText('Produto nao encontrado no ERP.');
  });

  test('exibe toast de erro em falha de comunicação com o ERP', async ({ page }) => {
    const count = await page.locator('#selCliente option').count();
    if (count <= 1) return test.skip();
    await page.selectOption('#selCliente', { index: 1 });
    await page.fill('#inputCodigo', '0000000000000');

    // Simula falha de rede
    await page.route('/api/produtos/validar', (route) => route.abort('failed'));
    await page.click('#btnValidar');

    await expect(page.locator('#toastErro')).toBeVisible();
  });

  test('resultado permanece oculto após erro', async ({ page }) => {
    if (!(await prepararEValidarComErro(page, 404, 'Produto nao encontrado no ERP.'))) {
      return test.skip();
    }
    await expect(page.locator('#resultado')).toHaveClass(/d-none/);
  });

  test('campo de código não é limpo após erro', async ({ page }) => {
    if (!(await prepararEValidarComErro(page, 404, 'Produto nao encontrado no ERP.'))) {
      return test.skip();
    }
    await expect(page.locator('#inputCodigo')).toHaveValue('0000000000000');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scanner — interface (sem acesso real à câmera)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Scanner — interface da câmera', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Concede permissão de câmera sem câmera real
    await page.context().grantPermissions(['camera']);
    await page.goto('/produtos/registro');
  });

  test('clique em btnCamera exibe o container do scanner', async ({ page }) => {
    // Mock getUserMedia para não bloquear
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new Error('no camera in test'));
    });
    await page.goto('/produtos/registro');

    await page.click('#btnCamera');
    await expect(page.locator('#readerContainer')).not.toHaveClass(/d-none/);
  });

  test('clique em btnFecharCamera oculta o container', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new Error('no camera in test'));
    });
    await page.goto('/produtos/registro');

    await page.click('#btnCamera');
    await page.click('#btnFecharCamera');
    await expect(page.locator('#readerContainer')).toHaveClass(/d-none/);
  });
});
