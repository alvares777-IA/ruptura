/**
 * scanner.js — Leitor de código de barras
 *
 * Estratégia:
 *  1. BarcodeDetector nativo (Chrome/Edge Android 83+) — usa detecção do SO, muito mais precisa
 *  2. Fallback: html5-qrcode (outros browsers)
 *
 * initScanner({ btnAbrir, btnFechar, container, readerId, onDecode })
 */
function initScanner(opts) {
  const btnAbrir  = document.getElementById(opts.btnAbrir);
  const btnFechar = document.getElementById(opts.btnFechar);
  const container = document.getElementById(opts.container);
  const onDecode  = opts.onDecode;

  if (!btnAbrir || !btnFechar || !container) return;

  let ativo      = false;

  // Estado modo nativo
  let stream     = null;
  let videoEl    = null;
  let detector   = null;
  let scanTimer  = null;

  // Estado fallback
  let h5         = null;

  const USA_NATIVE = 'BarcodeDetector' in window;

  /* ─── MODO NATIVO (BarcodeDetector) ─────────────────────────────── */
  async function abrirNativo() {
    // Descobre formatos suportados pelo dispositivo
    let formats;
    try {
      const sup   = await BarcodeDetector.getSupportedFormats();
      const quero = ['ean_13', 'ean_8', 'code_128', 'itf', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'data_matrix'];
      formats = quero.filter(f => sup.includes(f));
      if (!formats.length) formats = ['ean_13', 'ean_8', 'code_128'];
    } catch (e) {
      formats = ['ean_13', 'ean_8', 'code_128', 'itf', 'code_39', 'qr_code'];
    }
    detector = new BarcodeDetector({ formats });

    // Solicita câmera traseira em alta resolução
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    // Monta vídeo no container
    const readerEl = document.getElementById(opts.readerId);
    readerEl.innerHTML = '';
    readerEl.style.position = 'relative';

    videoEl            = document.createElement('video');
    videoEl.srcObject  = stream;
    videoEl.autoplay   = true;
    videoEl.playsInline = true;
    videoEl.muted      = true;
    videoEl.style.cssText = 'width:100%;display:block;border-radius:.375rem;';
    readerEl.appendChild(videoEl);

    // Linha animada para guiar o usuário
    const linha = document.createElement('div');
    linha.className = 'scanner-linha';
    readerEl.appendChild(linha);

    await videoEl.play().catch(function() {});

    // Loop de detecção a cada 150 ms (≈7 tentativas/s — suficiente e eficiente)
    async function doScan() {
      if (!ativo || !videoEl || videoEl.readyState < 2) return;
      try {
        const codes = await detector.detect(videoEl);
        if (codes.length) {
          const val = codes[0].rawValue.trim();
          if (val) {
            if (navigator.vibrate) navigator.vibrate(60);
            fecharCamera();
            onDecode(val);
          }
        }
      } catch (e) { /* frame com erro — ignora */ }
    }
    scanTimer = setInterval(doScan, 150);
  }

  /* ─── MODO FALLBACK (html5-qrcode) ──────────────────────────────── */
  function abrirFallback() {
    h5 = new Html5Qrcode(opts.readerId, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE,
      ],
      verbose: false,
    });

    h5.start(
      { facingMode: 'environment' },
      {
        fps: 20,
        qrbox: function(w, h) {
          return { width: Math.round(w * 0.88), height: Math.round(h * 0.38) };
        },
        videoConstraints: {
          facingMode: 'environment',
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        disableFlip: false,
      },
      function(text) {
        if (navigator.vibrate) navigator.vibrate(60);
        fecharCamera();
        onDecode(text.trim());
      },
      function() { /* erros de frame ignorados */ }
    ).catch(function(err) {
      console.warn('Câmera falhou:', err);
      fecharCamera();
      alert('Não foi possível acessar a câmera.\n' + (err.message || err));
    });
  }

  /* ─── ABRIR / FECHAR ─────────────────────────────────────────────── */
  function abrirCamera() {
    if (ativo) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Seu navegador não suporta acesso à câmera. Use Chrome ou Safari atualizado.');
      return;
    }
    container.classList.remove('d-none');
    ativo = true;

    if (USA_NATIVE) {
      abrirNativo().catch(function(err) {
        console.warn('BarcodeDetector falhou, usando fallback:', err);
        abrirFallback();
      });
    } else {
      abrirFallback();
    }
  }

  function fecharCamera() {
    if (!ativo) return;
    ativo = false;
    container.classList.add('d-none');

    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    if (stream)    { stream.getTracks().forEach(function(t) { t.stop(); }); stream = null; }
    if (videoEl)   { videoEl.srcObject = null; videoEl = null; }
    detector = null;

    if (h5) {
      h5.stop().catch(function() {}).finally(function() { h5.clear(); h5 = null; });
    }
  }

  btnAbrir.addEventListener('click', abrirCamera);
  btnFechar.addEventListener('click', fecharCamera);
  window.addEventListener('beforeunload', fecharCamera);
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) fecharCamera();
  });
}
