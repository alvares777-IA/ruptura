const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const { pool } = require('./database');
const { notificarAdminsNovoUsuario } = require('./email');

// ---------- Local Strategy ----------
passport.use(new LocalStrategy({ usernameField: 'email', passwordField: 'senha' }, async (email, senha, done) => {
  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND ativo = true',
      [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) {
      return done(null, false, { message: 'Email ou senha incorretos.' });
    }
    const user = result.rows[0];
    if (!user.senha) {
      return done(null, false, { message: 'Use o login com Google para esta conta.' });
    }
    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) return done(null, false, { message: 'Email ou senha incorretos.' });
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

// ---------- Google Strategy ----------
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value.toLowerCase();
      let result = await pool.query(
        'SELECT * FROM usuarios WHERE google_id = $1 OR email = $2',
        [profile.id, email]
      );
      let user;
      if (result.rows.length === 0) {
        // Auto-registro via Google — inativo ate ser ativado por um admin
        const ins = await pool.query(`
          INSERT INTO usuarios (nome, email, google_id, admin, ativo)
          VALUES ($1, $2, $3, false, false) RETURNING *
        `, [profile.displayName, email, profile.id]);
        notificarAdminsNovoUsuario(ins.rows[0]);
        return done(null, false, { message: 'Seu usuario foi criado com sucesso. Um e-mail solicitando seu acesso foi enviado aos administradores. Aguarde eles entrarem em contato.' });
      } else {
        user = result.rows[0];
        if (!user.ativo) return done(null, false, { message: 'Seu usuario aguarda ativacao pelos administradores. Entre em contato caso demore.' });
        // Vincula google_id se ainda nao vinculado
        if (!user.google_id) {
          await pool.query('UPDATE usuarios SET google_id=$1 WHERE id_usuario=$2', [profile.id, user.id_usuario]);
          user.google_id = profile.id;
        }
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
}

passport.serializeUser((user, done) => {
  done(null, user.id_usuario);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1 AND ativo = true',
      [id]
    );
    if (result.rows.length === 0) return done(null, false);
    done(null, result.rows[0]);
  } catch (err) {
    done(err);
  }
});
