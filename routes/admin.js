const express = require('express');
const bcrypt  = require('bcrypt');
const router  = express.Router();
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { requireMenu } = require('../middleware/permissions');
const { notificarAdminsNovoUsuario } = require('../config/email');

// Todos os endpoints de admin exigem autenticacao
router.use(requireAuth);

// ===================== USUARIOS =====================

router.get('/usuarios', requireMenu('/admin/usuarios'), async (req, res, next) => {
  try {
    const [usuariosQ, menusQ, clientesQ, permMenuQ, permCliQ] = await Promise.all([
      pool.query('SELECT id_usuario, nome, email, admin, ativo, created_at FROM usuarios ORDER BY nome'),
      pool.query('SELECT * FROM menus ORDER BY ordem'),
      pool.query('SELECT * FROM clientes WHERE ativo=true ORDER BY nome'),
      pool.query('SELECT * FROM permissao_menu'),
      pool.query('SELECT * FROM permissao_cliente'),
    ]);
    res.render('admin/usuarios', {
      usuarios:     usuariosQ.rows,
      menus:        menusQ.rows,
      clientes:     clientesQ.rows,
      permMenus:    permMenuQ.rows,
      permClientes: permCliQ.rows,
    });
  } catch (err) { next(err); }
});

router.post('/usuarios', requireMenu('/admin/usuarios'), async (req, res, next) => {
  try {
    const { nome, email, senha, admin: isAdmin } = req.body;
    const hash = await bcrypt.hash(senha.trim().toLowerCase(), 12);
    const ins = await pool.query(
      'INSERT INTO usuarios (nome, email, senha, admin, ativo) VALUES ($1,$2,$3,$4,false) RETURNING *',
      [nome, email.toLowerCase().trim(), hash, isAdmin === 'on']
    );
    notificarAdminsNovoUsuario(ins.rows[0]);
    req.session.flash = { tipo: 'success', msg: 'Usuario criado. Ele ficara inativo ate ser ativado por um administrador.' };
    res.redirect('/admin/usuarios');
  } catch (err) {
    if (err.code === '23505') {
      req.session.flash = { tipo: 'danger', msg: 'Email ja cadastrado.' };
      return res.redirect('/admin/usuarios');
    }
    next(err);
  }
});

router.post('/usuarios/:id/toggle', requireMenu('/admin/usuarios'), async (req, res, next) => {
  try {
    await pool.query('UPDATE usuarios SET ativo = NOT ativo WHERE id_usuario=$1', [req.params.id]);
    res.redirect('/admin/usuarios');
  } catch (err) { next(err); }
});

router.post('/usuarios/:id/resetsenha', requireMenu('/admin/usuarios'), async (req, res, next) => {
  try {
    const { nova_senha } = req.body;
    const hash = await bcrypt.hash(nova_senha.trim().toLowerCase(), 12);
    await pool.query('UPDATE usuarios SET senha=$1 WHERE id_usuario=$2', [hash, req.params.id]);
    req.session.flash = { tipo: 'success', msg: 'Senha alterada.' };
    res.redirect('/admin/usuarios');
  } catch (err) { next(err); }
});

router.put('/usuarios/:id', requireMenu('/admin/usuarios'), async (req, res, next) => {
  try {
    const { nome, email, senha, admin: isAdmin, ativo: isAtivo } = req.body;
    const id = req.params.id;

    // Impede remover o admin flag do ultimo administrador
    if (isAdmin !== 'on') {
      const u = await pool.query('SELECT admin FROM usuarios WHERE id_usuario=$1', [id]);
      if (u.rows[0]?.admin) {
        const check = await pool.query(
          'SELECT COUNT(*) FROM usuarios WHERE admin=true AND ativo=true AND id_usuario!=$1', [id]
        );
        if (parseInt(check.rows[0].count) === 0) {
          req.session.flash = { tipo: 'danger', msg: 'Nao e possivel remover o unico administrador.' };
          return res.redirect('/admin/usuarios');
        }
      }
    }

    if (senha && senha.trim()) {
      const hash = await bcrypt.hash(senha.trim().toLowerCase(), 12);
      await pool.query(
        'UPDATE usuarios SET nome=$1, email=$2, senha=$3, admin=$4, ativo=$5 WHERE id_usuario=$6',
        [nome, email.toLowerCase().trim(), hash, isAdmin === 'on', isAtivo === 'on', id]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET nome=$1, email=$2, admin=$3, ativo=$4 WHERE id_usuario=$5',
        [nome, email.toLowerCase().trim(), isAdmin === 'on', isAtivo === 'on', id]
      );
    }
    req.session.flash = { tipo: 'success', msg: 'Usuario atualizado.' };
    res.redirect('/admin/usuarios');
  } catch (err) {
    if (err.code === '23505') {
      req.session.flash = { tipo: 'danger', msg: 'Email ja cadastrado.' };
      return res.redirect('/admin/usuarios');
    }
    next(err);
  }
});

router.post('/usuarios/:id/toggleadmin', requireMenu('/admin/usuarios'), async (req, res, next) => {
  try {
    const id = req.params.id;
    if (String(id) === String(req.user.id_usuario)) {
      req.session.flash = { tipo: 'danger', msg: 'Voce nao pode alterar seu proprio status de administrador.' };
      return res.redirect('/admin/usuarios');
    }
    const u = await pool.query('SELECT admin FROM usuarios WHERE id_usuario=$1', [id]);
    if (u.rows[0]?.admin) {
      const check = await pool.query(
        'SELECT COUNT(*) FROM usuarios WHERE admin=true AND ativo=true AND id_usuario!=$1', [id]
      );
      if (parseInt(check.rows[0].count) === 0) {
        req.session.flash = { tipo: 'danger', msg: 'Nao e possivel remover o unico administrador.' };
        return res.redirect('/admin/usuarios');
      }
    }
    await pool.query('UPDATE usuarios SET admin = NOT admin WHERE id_usuario=$1', [id]);
    res.redirect('/admin/usuarios');
  } catch (err) { next(err); }
});

router.delete('/usuarios/:id', requireMenu('/admin/usuarios'), async (req, res, next) => {
  const id = req.params.id;
  try {
    if (String(id) === String(req.user.id_usuario)) {
      req.session.flash = { tipo: 'danger', msg: 'Voce nao pode excluir seu proprio usuario.' };
      return res.redirect('/admin/usuarios');
    }

    // Impede excluir o ultimo admin ativo
    const adminCheck = await pool.query(
      'SELECT COUNT(*) FROM usuarios WHERE admin=true AND ativo=true AND id_usuario != $1', [id]
    );
    const usuarioAlvo = await pool.query('SELECT admin FROM usuarios WHERE id_usuario=$1', [id]);
    if (usuarioAlvo.rows[0]?.admin && parseInt(adminCheck.rows[0].count) === 0) {
      req.session.flash = { tipo: 'danger', msg: 'Nao e possivel excluir o ultimo administrador.' };
      return res.redirect('/admin/usuarios');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM permissao_menu    WHERE id_usuario=$1', [id]);
      await client.query('DELETE FROM permissao_cliente WHERE id_usuario=$1', [id]);
      await client.query('DELETE FROM produtos_coletados WHERE id_usuario=$1', [id]);
      await client.query('DELETE FROM usuarios           WHERE id_usuario=$1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    req.session.flash = { tipo: 'success', msg: 'Usuario excluido com sucesso.' };
    res.redirect('/admin/usuarios');
  } catch (err) { next(err); }
});

// ===================== CLIENTES =====================

router.get('/clientes', requireMenu('/admin/clientes'), async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY nome');
    res.render('admin/clientes', { clientes: result.rows });
  } catch (err) { next(err); }
});

router.post('/clientes', requireMenu('/admin/clientes'), async (req, res, next) => {
  try {
    const { nome, tipo_conexao, host, porta, banco_dados, schema_bd, sid,
            usuario_bd, senha_bd, endpoint_url, endpoint_token, query_produto,
            id_bandeira, id_loja } = req.body;
    await pool.query(`
      INSERT INTO clientes (nome, tipo_conexao, host, porta, banco_dados, schema_bd, sid,
                            usuario_bd, senha_bd, endpoint_url, endpoint_token, query_produto,
                            id_bandeira, id_loja)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [nome, tipo_conexao, host, porta || null, banco_dados, schema_bd, sid,
        usuario_bd, senha_bd, endpoint_url, endpoint_token, query_produto,
        id_bandeira || null, parseInt(id_loja) || 1]);
    req.session.flash = { tipo: 'success', msg: 'Cliente cadastrado.' };
    res.redirect('/admin/clientes');
  } catch (err) { next(err); }
});

router.post('/clientes/:id/toggle', requireMenu('/admin/clientes'), async (req, res, next) => {
  try {
    await pool.query('UPDATE clientes SET ativo = NOT ativo WHERE id_cliente=$1', [req.params.id]);
    res.redirect('/admin/clientes');
  } catch (err) { next(err); }
});

router.post('/clientes/:id', requireMenu('/admin/clientes'), async (req, res, next) => {
  try {
    const { nome, tipo_conexao, host, porta, banco_dados, schema_bd, sid,
            usuario_bd, senha_bd, endpoint_url, endpoint_token, query_produto,
            id_bandeira, id_loja } = req.body;
    const idLoja = parseInt(id_loja) || 1;

    if (senha_bd && senha_bd.trim() !== '') {
      await pool.query(`
        UPDATE clientes SET nome=$1, tipo_conexao=$2, host=$3, porta=$4, banco_dados=$5,
          schema_bd=$6, sid=$7, usuario_bd=$8, senha_bd=$9, endpoint_url=$10,
          endpoint_token=$11, query_produto=$12, id_bandeira=$13, id_loja=$14
        WHERE id_cliente=$15
      `, [nome, tipo_conexao, host, porta || null, banco_dados, schema_bd, sid,
          usuario_bd, senha_bd.trim(), endpoint_url, endpoint_token, query_produto,
          id_bandeira || null, idLoja, req.params.id]);
    } else {
      await pool.query(`
        UPDATE clientes SET nome=$1, tipo_conexao=$2, host=$3, porta=$4, banco_dados=$5,
          schema_bd=$6, sid=$7, usuario_bd=$8, endpoint_url=$9,
          endpoint_token=$10, query_produto=$11, id_bandeira=$12, id_loja=$13
        WHERE id_cliente=$14
      `, [nome, tipo_conexao, host, porta || null, banco_dados, schema_bd, sid,
          usuario_bd, endpoint_url, endpoint_token, query_produto,
          id_bandeira || null, idLoja, req.params.id]);
    }

    req.session.flash = { tipo: 'success', msg: 'Cliente atualizado.' };
    res.redirect('/admin/clientes');
  } catch (err) { next(err); }
});

// ===================== PERMISSOES =====================

router.get('/permissoes', (req, res) => res.redirect('/admin/usuarios'));

router.get('/permissoes_old', requireMenu('/admin/usuarios'), async (req, res, next) => {
  try {
    const currentUser = req.user;

    // Usuarios que o logado pode gerenciar (nao pode editar admin se nao for admin)
    const usuariosQ = currentUser.admin
      ? await pool.query('SELECT id_usuario, nome, email FROM usuarios WHERE ativo=true ORDER BY nome')
      : await pool.query('SELECT id_usuario, nome, email FROM usuarios WHERE ativo=true AND admin=false ORDER BY nome');

    // Menus que o logado tem acesso para poder delegar
    const menusQ = currentUser.admin
      ? await pool.query('SELECT * FROM menus ORDER BY ordem')
      : await pool.query(`
          SELECT m.* FROM menus m
          JOIN permissao_menu pm ON pm.id_menu = m.id_menu
          WHERE pm.id_usuario = $1 ORDER BY m.ordem
        `, [currentUser.id_usuario]);

    // Clientes que o logado tem acesso para poder delegar
    const clientesQ = currentUser.admin
      ? await pool.query('SELECT * FROM clientes WHERE ativo=true ORDER BY nome')
      : await pool.query(`
          SELECT c.* FROM clientes c
          JOIN permissao_cliente pc ON pc.id_cliente = c.id_cliente
          WHERE pc.id_usuario = $1 AND c.ativo=true ORDER BY c.nome
        `, [currentUser.id_usuario]);

    // Permissoes existentes
    const permMenuQ  = await pool.query('SELECT * FROM permissao_menu');
    const permCliQ   = await pool.query('SELECT * FROM permissao_cliente');

    res.render('admin/permissoes', {
      usuarios:    usuariosQ.rows,
      menus:       menusQ.rows,
      clientes:    clientesQ.rows,
      permMenus:   permMenuQ.rows,
      permClientes: permCliQ.rows,
    });
  } catch (err) { next(err); }
});

// Toggle permissao menu
router.post('/permissoes/menu', requireMenu('/admin/usuarios'), async (req, res, next) => {
  try {
    const { id_usuario, id_menu, acao } = req.body;

    // Verifica se quem concede tem a permissao
    if (!req.user.admin) {
      const check = await pool.query(
        'SELECT 1 FROM permissao_menu WHERE id_usuario=$1 AND id_menu=$2',
        [req.user.id_usuario, id_menu]
      );
      if (check.rows.length === 0) {
        return res.status(403).json({ ok: false, msg: 'Voce nao tem essa permissao para delegar.' });
      }
    }

    if (acao === 'grant') {
      await pool.query(
        'INSERT INTO permissao_menu (id_menu, id_usuario) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [id_menu, id_usuario]
      );
    } else {
      await pool.query(
        'DELETE FROM permissao_menu WHERE id_menu=$1 AND id_usuario=$2',
        [id_menu, id_usuario]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Toggle permissao cliente
router.post('/permissoes/cliente', requireMenu('/admin/usuarios'), async (req, res, next) => {
  try {
    const { id_usuario, id_cliente, acao } = req.body;

    if (!req.user.admin) {
      const check = await pool.query(
        'SELECT 1 FROM permissao_cliente WHERE id_usuario=$1 AND id_cliente=$2',
        [req.user.id_usuario, id_cliente]
      );
      if (check.rows.length === 0) {
        return res.status(403).json({ ok: false, msg: 'Voce nao tem acesso a este cliente para delegar.' });
      }
    }

    if (acao === 'grant') {
      await pool.query(
        'INSERT INTO permissao_cliente (id_cliente, id_usuario) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [id_cliente, id_usuario]
      );
    } else {
      await pool.query(
        'DELETE FROM permissao_cliente WHERE id_cliente=$1 AND id_usuario=$2',
        [id_cliente, id_usuario]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
