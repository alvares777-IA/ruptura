const express = require('express');
const router  = express.Router();
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { requireMenu } = require('../middleware/permissions');

router.use(requireAuth);

// ===================== REGISTRO =====================

router.get('/registro', requireMenu('/produtos/registro'), async (req, res, next) => {
  try {
    let clientesQ;
    if (req.user.admin) {
      clientesQ = await pool.query('SELECT * FROM clientes WHERE ativo=true ORDER BY nome');
    } else {
      clientesQ = await pool.query(`
        SELECT c.* FROM clientes c
        JOIN permissao_cliente pc ON pc.id_cliente = c.id_cliente
        WHERE pc.id_usuario = $1 AND c.ativo=true ORDER BY c.nome
      `, [req.user.id_usuario]);
    }
    res.render('produtos/registro', { clientes: clientesQ.rows });
  } catch (err) { next(err); }
});

// ===================== LISTA DO DIA =====================

router.get('/lista', requireMenu('/produtos/lista'), async (req, res, next) => {
  try {
    let clientesQ;
    if (req.user.admin) {
      clientesQ = await pool.query('SELECT * FROM clientes WHERE ativo=true ORDER BY nome');
    } else {
      clientesQ = await pool.query(`
        SELECT c.* FROM clientes c
        JOIN permissao_cliente pc ON pc.id_cliente = c.id_cliente
        WHERE pc.id_usuario = $1 AND c.ativo=true ORDER BY c.nome
      `, [req.user.id_usuario]);
    }

    const id_cliente = req.query.id_cliente || (clientesQ.rows[0] ? clientesQ.rows[0].id_cliente : null);
    let produtos = [];

    if (id_cliente) {
      const q = await pool.query(`
        SELECT p.*, u.nome as nome_usuario
        FROM produtos_coletados p
        JOIN usuarios u ON u.id_usuario = p.id_usuario
        WHERE p.id_cliente = $1
          AND p.dt_coleta = CURRENT_DATE
          AND ($2 OR p.id_usuario = $3)
        ORDER BY p.created_at DESC
      `, [id_cliente, req.user.admin, req.user.id_usuario]);
      produtos = q.rows;
    }

    res.render('produtos/lista', {
      clientes:     clientesQ.rows,
      id_cliente:   id_cliente ? parseInt(id_cliente) : null,
      produtos,
    });
  } catch (err) { next(err); }
});

module.exports = router;
