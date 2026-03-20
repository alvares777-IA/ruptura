const { pool } = require('../config/database');

/**
 * Verifica se o usuario logado tem acesso ao menu pelo link.
 * Admin sempre passa.
 */
function requireMenu(link) {
  return async (req, res, next) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    if (req.user.admin) return next();
    try {
      const result = await pool.query(`
        SELECT 1 FROM permissao_menu pm
        JOIN menus m ON m.id_menu = pm.id_menu
        WHERE pm.id_usuario = $1 AND m.link = $2
      `, [req.user.id_usuario, link]);
      if (result.rows.length > 0) return next();
      return res.status(403).render('error', { code: 403, message: 'Sem permissao para acessar esta pagina.' });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Verifica se o usuario tem acesso ao cliente informado.
 * Admin sempre passa. Espera id_cliente em req.body, req.params ou req.query.
 */
async function checkClienteAccess(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/login');
  if (req.user.admin) return next();
  const id_cliente = req.body.id_cliente || req.params.id_cliente || req.query.id_cliente;
  if (!id_cliente) return res.status(400).render('error', { code: 400, message: 'Cliente nao informado.' });
  try {
    const result = await pool.query(
      'SELECT 1 FROM permissao_cliente WHERE id_usuario=$1 AND id_cliente=$2',
      [req.user.id_usuario, id_cliente]
    );
    if (result.rows.length > 0) return next();
    return res.status(403).render('error', { code: 403, message: 'Sem permissao para este cliente.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { requireMenu, checkClienteAccess };
