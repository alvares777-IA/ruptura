require('dotenv').config();
const express        = require('express');
const expressLayouts = require('express-ejs-layouts');
const session        = require('express-session');
const passport       = require('passport');
const pgSession      = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path           = require('path');
const { pool }       = require('./config/database');
require('./config/passport');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

app.use(session({
  store: new pgSession({ pool, tableName: 'sessions' }),
  secret:            process.env.SESSION_SECRET || 'ruptura-secret-fallback',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   30 * 24 * 60 * 60 * 1000,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// Injeta usuario, menus e flash em todas as views
app.use(async (req, res, next) => {
  res.locals.user       = req.user || null;
  res.locals.menus      = [];
  res.locals.flash      = req.session.flash || null;
  res.locals.activeMenu = '';
  res.locals.googleEnabled = !!(process.env.GOOGLE_CLIENT_ID);
  req.session.flash = null;

  if (req.user) {
    try {
      let q;
      if (req.user.admin) {
        q = await pool.query('SELECT * FROM menus ORDER BY ordem');
      } else {
        q = await pool.query(`
          SELECT m.* FROM menus m
          JOIN permissao_menu pm ON pm.id_menu = m.id_menu
          WHERE pm.id_usuario = $1
          ORDER BY m.ordem
        `, [req.user.id_usuario]);
      }
      res.locals.menus = q.rows;
    } catch (err) {
      console.error('Erro ao carregar menus:', err.message);
    }
  }
  next();
});

app.use('/',           require('./routes/auth'));
app.use('/admin',      require('./routes/admin'));
app.use('/produtos',   require('./routes/produtos'));
app.use('/relatorios', require('./routes/relatorios'));
app.use('/api',        require('./routes/api'));

app.get('/', (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Nao encontrado', code: 404, message: 'Pagina nao encontrada.' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Erro', code: 500, message: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ruptura rodando em http://localhost:${PORT}`));
