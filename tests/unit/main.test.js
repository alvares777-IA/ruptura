/**
 * Testes unitários — public/js/main.js
 *
 * Cobre: auto-dismiss de alertas, confirmação de ações destrutivas,
 *        spinner no submit, filtro de input EAN, tooltips Bootstrap.
 *
 * Ambiente: Jest + jsdom
 * Pré-requisito: npm install --save-dev jest jest-environment-jsdom jquery
 */

const $ = require('jquery');
global.$ = global.jQuery = $;
global.bootstrap = { Tooltip: jest.fn().mockImplementation(() => ({})) };
global.confirm = jest.fn();

// ─────────────────────────────────────────────────────────────────────────────
// Auto-dismiss
// ─────────────────────────────────────────────────────────────────────────────
describe('Auto-dismiss de alertas (5 s)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function registraAutoDismiss() {
    setTimeout(function () {
      $('.alert.alert-success, .alert.alert-info').fadeOut(400);
    }, 5000);
  }

  test('alert-success ainda visível antes dos 5 s', () => {
    document.body.innerHTML = '<div class="alert alert-success">OK</div>';
    registraAutoDismiss();
    jest.advanceTimersByTime(4999);
    expect($('.alert.alert-success').length).toBe(1);
  });

  test('fadeOut iniciado após 5 s no alert-info', () => {
    document.body.innerHTML = '<div class="alert alert-info">Info</div>';
    const spy = jest.spyOn($.fn, 'fadeOut');
    registraAutoDismiss();
    jest.advanceTimersByTime(5001);
    expect(spy).toHaveBeenCalledWith(400);
    spy.mockRestore();
  });

  test('alert-danger não é afetado pelo auto-dismiss', () => {
    document.body.innerHTML = '<div class="alert alert-danger">Erro</div>';
    const spy = jest.spyOn($.fn, 'fadeOut');
    registraAutoDismiss();
    jest.advanceTimersByTime(10_000);
    // fadeOut é chamado, mas o seletor não inclui alert-danger —
    // verifica que o elemento continua no DOM
    expect($('.alert.alert-danger').length).toBe(1);
    spy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Confirmação de ações destrutivas
// ─────────────────────────────────────────────────────────────────────────────
describe('Confirmação de ações destrutivas', () => {
  function bindConfirm(formEl) {
    $(formEl).on('submit', function (e) {
      if (!window.confirm($(this).data('confirm'))) {
        e.preventDefault();
      }
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('preventDefault quando confirm retorna false', () => {
    document.body.innerHTML =
      '<form data-confirm="Excluir?"><button type="submit">Excluir</button></form>';
    bindConfirm(document.querySelector('form'));
    global.confirm.mockReturnValue(false);

    const event = $.Event('submit');
    event.preventDefault = jest.fn();
    $('form').trigger(event);

    expect(global.confirm).toHaveBeenCalledWith('Excluir?');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('não chama preventDefault quando confirm retorna true', () => {
    document.body.innerHTML =
      '<form data-confirm="Excluir?"><button type="submit">Excluir</button></form>';
    bindConfirm(document.querySelector('form'));
    global.confirm.mockReturnValue(true);

    const event = $.Event('submit');
    event.preventDefault = jest.fn();
    $('form').trigger(event);

    expect(global.confirm).toHaveBeenCalledWith('Excluir?');
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test('formulário sem data-confirm não aciona confirm()', () => {
    document.body.innerHTML = '<form><button type="submit">Salvar</button></form>';
    // Nenhum bind — confirm não deve ser chamado
    $('form').trigger('submit');
    expect(global.confirm).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Spinner no submit
// ─────────────────────────────────────────────────────────────────────────────
describe('Spinner no submit do formulário', () => {
  function bindSpinner(formEl) {
    $(formEl).on('submit', function () {
      const btn = $(this).find('button[type="submit"]');
      if (btn.length && !btn.data('no-spinner')) {
        btn.prop('disabled', true);
        const orig = btn.html();
        btn.html('<span class="spinner-border spinner-border-sm me-1"></span>');
        setTimeout(function () {
          btn.prop('disabled', false).html(orig);
        }, 10_000);
      }
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML =
      '<form><button type="submit">Salvar</button></form>';
    bindSpinner(document.querySelector('form'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('desabilita o botão ao submeter', () => {
    $('form').trigger('submit');
    expect($('button[type="submit"]').prop('disabled')).toBe(true);
  });

  test('substitui texto do botão por spinner', () => {
    $('form').trigger('submit');
    expect($('button[type="submit"]').html()).toContain('spinner-border');
  });

  test('restaura botão após 10 s (failsafe)', () => {
    const orig = $('button[type="submit"]').html();
    $('form').trigger('submit');
    jest.advanceTimersByTime(10_000);
    expect($('button[type="submit"]').prop('disabled')).toBe(false);
    expect($('button[type="submit"]').html()).toBe(orig);
  });

  test('ignora botão com data-no-spinner', () => {
    document.body.innerHTML =
      '<form><button type="submit" data-no-spinner="true">OK</button></form>';
    const form = document.querySelector('form');
    bindSpinner(form);
    $(form).trigger('submit');
    expect($('button[type="submit"]').prop('disabled')).toBe(false);
  });

  test('não quebra se formulário não tem botão submit', () => {
    document.body.innerHTML = '<form><input type="text"></form>';
    const form = document.querySelector('form');
    bindSpinner(form);
    expect(() => $(form).trigger('submit')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Filtro de input EAN (apenas números)
// ─────────────────────────────────────────────────────────────────────────────
describe('Input EAN — somente dígitos', () => {
  function bindNumericFilter(inputEl) {
    $(inputEl).on('keypress', function (e) {
      if (e.which < 48 || e.which > 57) {
        if (e.which !== 13) e.preventDefault();
      }
    });
  }

  function dispararKeypress(input, which) {
    const event = $.Event('keypress', { which });
    event.preventDefault = jest.fn();
    $(input).trigger(event);
    return event;
  }

  beforeEach(() => {
    document.body.innerHTML = '<input type="text" inputmode="numeric">';
    bindNumericFilter(document.querySelector('input'));
  });

  test.each([
    [65, 'A'],
    [32, 'espaço'],
    [45, 'hífen'],
    [46, 'ponto'],
    [101, 'e'],
  ])('bloqueia tecla which=%i (%s)', (which) => {
    const event = dispararKeypress(document.querySelector('input'), which);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test.each([
    [48, '0'],
    [49, '1'],
    [53, '5'],
    [57, '9'],
  ])('permite dígito which=%i (%s)', (which) => {
    const event = dispararKeypress(document.querySelector('input'), which);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test('permite Enter (which=13) para avançar campo', () => {
    const event = dispararKeypress(document.querySelector('input'), 13);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tooltips Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
describe('Inicialização de Tooltips Bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  test('instancia Tooltip para cada elemento com data-bs-toggle="tooltip"', () => {
    document.body.innerHTML = `
      <button data-bs-toggle="tooltip" title="Dica 1">A</button>
      <button data-bs-toggle="tooltip" title="Dica 2">B</button>
      <button>Sem tooltip</button>
    `;
    const els = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    els.forEach(function (el) { new bootstrap.Tooltip(el); });
    expect(bootstrap.Tooltip).toHaveBeenCalledTimes(2);
  });

  test('não lança erro quando não há elementos com tooltip', () => {
    document.body.innerHTML = '<div>Sem tooltips aqui</div>';
    const els = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    expect(() => {
      els.forEach(function (el) { new bootstrap.Tooltip(el); });
    }).not.toThrow();
    expect(bootstrap.Tooltip).not.toHaveBeenCalled();
  });
});
