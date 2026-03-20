/**
 * scanner.js — Wrapper para html5-qrcode
 *
 * initScanner({ btnAbrir, btnFechar, container, readerId, onDecode })
 *
 * Suporta EAN-8, EAN-13, CODE-128, ITF (DUN-14) e QR Code.
 * Funciona em Android Chrome e iOS Safari (requer HTTPS em producao).
 */
function initScanner(opts) {
  const btnAbrir    = document.getElementById(opts.btnAbrir);
  const btnFechar   = document.getElementById(opts.btnFechar);
  const container   = document.getElementById(opts.container);
  const onDecode    = opts.onDecode;

  if (!btnAbrir || !btnFechar || !container) return;

  let scanner = null;
  let ativo   = false;

  const FORMATOS = [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.ITF,        // DUN-14
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.QR_CODE,
  ];

  function abrirCamera() {
    if (ativo) return;

    // Verifica suporte
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Seu navegador nao suporta acesso a camera. Use Chrome ou Safari atualizado.');
      return;
    }

    container.classList.remove('d-none');
    ativo = true;

    scanner = new Html5Qrcode(opts.readerId, {
      formatsToSupport: FORMATOS,
      verbose: false,
    });

    const config = {
      fps: 12,
      qrbox: function(w, h) {
        const menor = Math.min(w, h);
        return { width: Math.round(menor * 0.75), height: Math.round(menor * 0.4) };
      },
      aspectRatio: 1.7,
      disableFlip: false,
    };

    scanner.start(
      { facingMode: 'environment' },
      config,
      function(decodedText) {
        // Feedback tátil se disponivel
        if (navigator.vibrate) navigator.vibrate(60);
        fecharCamera();
        onDecode(decodedText.trim());
      },
      function() { /* erros de leitura ignorados */ }
    ).catch(function(err) {
      console.warn('Erro ao iniciar camera:', err);
      fecharCamera();
      alert('Nao foi possivel acessar a camera.\n' + (err.message || err));
    });
  }

  function fecharCamera() {
    if (!ativo) return;
    ativo = false;
    container.classList.add('d-none');
    if (scanner) {
      scanner.stop().catch(function() {}).finally(function() {
        scanner.clear();
        scanner = null;
      });
    }
  }

  btnAbrir.addEventListener('click', abrirCamera);
  btnFechar.addEventListener('click', fecharCamera);

  // Fecha ao sair da pagina
  window.addEventListener('beforeunload', fecharCamera);
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) fecharCamera();
  });
}
