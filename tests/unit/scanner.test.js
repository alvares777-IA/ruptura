/**
 * Testes unitários — public/js/scanner.js
 *
 * Cobre: inicialização defensiva, estado da câmera (abrir/fechar),
 *        seleção de modo nativo vs fallback, ciclo de vida da página.
 *
 * Ambiente: Jest + jsdom
 * Pré-requisito: npm install --save-dev jest jest-environment-jsdom
 */

const fs = require('fs');
const path = require('path');

// Carrega scanner.js como uma factory que devolve initScanner.
// O wrapper passa window/document/navigator como parâmetros para que
// os mocks por teste sejam refletidos corretamente.
const scannerSrc = fs.readFileSync(
  path.join(__dirname, '../../public/js/scanner.js'),
  'utf8'
);

// eslint-disable-next-line no-new-func
const _scannerFactory = new Function(
  'window',
  'document',
  'navigator',
  scannerSrc + '\nreturn initScanner;'
);

function makeInitScanner() {
  return _scannerFactory(globalThis, globalThis.document, globalThis.navigator);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function criarDOM() {
  document.body.innerHTML = `
    <button id="btn-abrir">Abrir câmera</button>
    <button id="btn-fechar">Fechar câmera</button>
    <div id="scanner-container" class="d-none">
      <div id="reader"></div>
    </div>
  `;
}

function optsBase(overrides = {}) {
  return {
    btnAbrir:  'btn-abrir',
    btnFechar: 'btn-fechar',
    container: 'scanner-container',
    readerId:  'reader',
    onDecode:  jest.fn(),
    ...overrides,
  };
}

function mockStream() {
  return {
    getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────────────────────────────────────
describe('initScanner — inicialização', () => {
  beforeEach(() => {
    criarDOM();
    delete globalThis.BarcodeDetector;
    globalThis.Html5Qrcode = jest.fn().mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop:  jest.fn().mockResolvedValue(undefined),
      clear: jest.fn(),
    }));
    globalThis.Html5QrcodeSupportedFormats = {
      EAN_13: 'ean_13', EAN_8: 'ean_8',
      CODE_128: 'code_128', ITF: 'itf',
      CODE_39: 'code_39', QR_CODE: 'qr_code',
    };
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(mockStream()) },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('retorna sem erro quando btnAbrir não existe no DOM', () => {
    document.body.innerHTML = '';
    const fn = makeInitScanner();
    expect(() => fn(optsBase())).not.toThrow();
  });

  test('retorna sem erro quando container não existe no DOM', () => {
    document.body.innerHTML =
      '<button id="btn-abrir"></button><button id="btn-fechar"></button>';
    const fn = makeInitScanner();
    expect(() => fn(optsBase())).not.toThrow();
  });

  test('container começa com classe d-none (câmera fechada)', () => {
    makeInitScanner()(optsBase());
    expect(
      document.getElementById('scanner-container').classList.contains('d-none')
    ).toBe(true);
  });

  test('onDecode não é chamado antes de qualquer interação', () => {
    const onDecode = jest.fn();
    makeInitScanner()(optsBase({ onDecode }));
    expect(onDecode).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Abertura e fechamento da câmera
// ─────────────────────────────────────────────────────────────────────────────
describe('initScanner — abrir câmera', () => {
  beforeEach(() => {
    criarDOM();
    delete globalThis.BarcodeDetector;
    globalThis.Html5Qrcode = jest.fn().mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop:  jest.fn().mockResolvedValue(undefined),
      clear: jest.fn(),
    }));
    globalThis.Html5QrcodeSupportedFormats = {
      EAN_13: 'ean_13', EAN_8: 'ean_8',
      CODE_128: 'code_128', ITF: 'itf',
      CODE_39: 'code_39', QR_CODE: 'qr_code',
    };
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(mockStream()) },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('clique em btnAbrir remove d-none do container', () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();
    expect(
      document.getElementById('scanner-container').classList.contains('d-none')
    ).toBe(false);
  });

  test('click duplo em btnAbrir não instancia Html5Qrcode duas vezes', () => {
    makeInitScanner()(optsBase());
    const btn = document.getElementById('btn-abrir');
    btn.click();
    btn.click();
    expect(globalThis.Html5Qrcode).toHaveBeenCalledTimes(1);
  });

  test('clique em btnFechar restaura d-none após câmera aberta', () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();
    document.getElementById('btn-fechar').click();
    expect(
      document.getElementById('scanner-container').classList.contains('d-none')
    ).toBe(true);
  });

  test('fechar câmera que já está fechada não lança erro', () => {
    makeInitScanner()(optsBase());
    expect(() => {
      document.getElementById('btn-fechar').click();
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Modo fallback (Html5Qrcode) — sem BarcodeDetector
// ─────────────────────────────────────────────────────────────────────────────
describe('initScanner — modo fallback (Html5Qrcode)', () => {
  let h5Instance;

  beforeEach(() => {
    criarDOM();
    delete globalThis.BarcodeDetector;

    h5Instance = {
      start: jest.fn().mockResolvedValue(undefined),
      stop:  jest.fn().mockResolvedValue(undefined),
      clear: jest.fn(),
    };
    globalThis.Html5Qrcode = jest.fn().mockReturnValue(h5Instance);
    globalThis.Html5QrcodeSupportedFormats = {
      EAN_13: 'ean_13', EAN_8: 'ean_8',
      CODE_128: 'code_128', ITF: 'itf',
      CODE_39: 'code_39', QR_CODE: 'qr_code',
    };
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(mockStream()) },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('instancia Html5Qrcode com o readerId correto', () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();
    expect(globalThis.Html5Qrcode).toHaveBeenCalledWith(
      'reader',
      expect.objectContaining({ verbose: false })
    );
  });

  test('passa formatos de código de barras esperados', () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();
    expect(globalThis.Html5Qrcode).toHaveBeenCalledWith(
      'reader',
      expect.objectContaining({
        formatsToSupport: expect.arrayContaining(['ean_13', 'ean_8', 'code_128']),
      })
    );
  });

  test('chama h5.start() ao abrir câmera', () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();
    expect(h5Instance.start).toHaveBeenCalledTimes(1);
  });

  test('chama h5.stop() ao fechar câmera', async () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();
    document.getElementById('btn-fechar').click();
    // stop() é async — aguarda microtasks
    await Promise.resolve();
    expect(h5Instance.stop).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Modo nativo (BarcodeDetector disponível)
// ─────────────────────────────────────────────────────────────────────────────
describe('initScanner — modo nativo (BarcodeDetector)', () => {
  beforeEach(() => {
    criarDOM();

    globalThis.BarcodeDetector = jest.fn().mockImplementation(() => ({
      detect: jest.fn().mockResolvedValue([]),
    }));
    globalThis.BarcodeDetector.getSupportedFormats = jest
      .fn()
      .mockResolvedValue(['ean_13', 'ean_8', 'code_128', 'itf']);

    globalThis.Html5Qrcode = jest.fn();
    globalThis.Html5QrcodeSupportedFormats = {};

    // Mock de getUserMedia que devolve um stream com vídeo
    const stream = mockStream();
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
      configurable: true,
      writable: true,
    });

    // Mock de HTMLVideoElement.play (jsdom não implementa)
    HTMLVideoElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete HTMLVideoElement.prototype.play;
  });

  test('não instancia Html5Qrcode quando BarcodeDetector está disponível', () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();
    expect(globalThis.Html5Qrcode).not.toHaveBeenCalled();
  });

  test('solicita câmera traseira via getUserMedia', async () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();
    // aguarda a promise de getSupportedFormats + getUserMedia
    await Promise.resolve();
    await Promise.resolve();
    expect(globalThis.navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          facingMode: expect.objectContaining({ ideal: 'environment' }),
        }),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de vida da página
// ─────────────────────────────────────────────────────────────────────────────
describe('initScanner — ciclo de vida da página', () => {
  beforeEach(() => {
    criarDOM();
    delete globalThis.BarcodeDetector;
    globalThis.Html5Qrcode = jest.fn().mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop:  jest.fn().mockResolvedValue(undefined),
      clear: jest.fn(),
    }));
    globalThis.Html5QrcodeSupportedFormats = {
      EAN_13: 'ean_13', EAN_8: 'ean_8',
      CODE_128: 'code_128', ITF: 'itf',
      CODE_39: 'code_39', QR_CODE: 'qr_code',
    };
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(mockStream()) },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });
  });

  test('fecha câmera quando documento fica oculto (visibilitychange)', () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();

    Object.defineProperty(document, 'hidden', {
      value: true,
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(
      document.getElementById('scanner-container').classList.contains('d-none')
    ).toBe(true);
  });

  test('não fecha câmera quando documento fica visível', () => {
    makeInitScanner()(optsBase());
    document.getElementById('btn-abrir').click();

    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(
      document.getElementById('scanner-container').classList.contains('d-none')
    ).toBe(false);
  });
});
