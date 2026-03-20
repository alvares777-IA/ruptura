/**
 * main.js — utilitarios globais do Ruptura
 */
$(function() {

  // Auto-dismiss alerts apos 5s
  setTimeout(function() {
    $('.alert.alert-success, .alert.alert-info').fadeOut(400);
  }, 5000);

  // Confirmar acoes destrutivas
  $('form[data-confirm]').on('submit', function(e) {
    if (!confirm($(this).data('confirm'))) {
      e.preventDefault();
    }
  });

  // Mostrar spinner em botoes de formulario no submit
  $('form').on('submit', function() {
    const btn = $(this).find('button[type="submit"]');
    if (btn.length && !btn.data('no-spinner')) {
      btn.prop('disabled', true);
      const orig = btn.html();
      btn.html('<span class="spinner-border spinner-border-sm me-1"></span>');
      // Restaura apos 10s (failsafe)
      setTimeout(function() { btn.prop('disabled', false).html(orig); }, 10000);
    }
  });

  // Input EAN: aceitar apenas numeros e deixar ir pro proximo campo
  $('input[inputmode="numeric"]').on('keypress', function(e) {
    if (e.which < 48 || e.which > 57) {
      if (e.which !== 13) e.preventDefault();
    }
  });

  // Tooltip Bootstrap
  var tooltipEls = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipEls.forEach(function(el) { new bootstrap.Tooltip(el); });

});
