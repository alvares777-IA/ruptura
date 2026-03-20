/**
 * Garante que o usuario esta autenticado.
 */
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

/**
 * Garante que o usuario e admin.
 */
function requireAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.admin) return next();
  res.status(403).render('error', { code: 403, message: 'Acesso restrito ao administrador.' });
}

module.exports = { requireAuth, requireAdmin };
