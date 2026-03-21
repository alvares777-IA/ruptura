const express  = require('express');
const passport = require('passport');
const router   = express.Router();

// GET /login
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  const erro = req.query.erro
    || (req.session.messages && req.session.messages.pop())
    || null;
  res.render('login', { erro });
});

// POST /login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.redirect('/login?erro=' + encodeURIComponent(info?.message || 'Credenciais invalidas.'));
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      const returnTo = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });
  })(req, res, next);
});

// GET /auth/google
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// GET /auth/google/callback
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', failureMessage: true }),
  (req, res) => {
    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

// GET /logout
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect('/login'));
  });
});

// GET /dashboard
router.get('/dashboard', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.render('dashboard');
});

module.exports = router;
