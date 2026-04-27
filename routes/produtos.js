const express = require('express');
const router  = express.Router();
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { requireMenu } = require('../middleware/permissions');

router.use(requireAuth);

async function fetchClientes(req) {
  if (req.user.admin) {
    return pool.query('SELECT * FROM clientes WHERE ativo=true ORDER BY nome');
  }
  return pool.query(`
    SELECT c.* FROM clientes c
    JOIN permissao_cliente pc ON pc.id_cliente = c.id_cliente
    WHERE pc.id_usuario = $1 AND c.ativo=true ORDER BY c.nome
  `, [req.user.id_usuario]);
}

// ===================== SELEÇÃO DE CLIENTE =====================

router.get('/selecionar', async (req, res, next) => {
  try {
    const clientesQ = await fetchClientes(req);
    const destino = ['registro', 'lista'].includes(req.query.destino) ? req.query.destino : 'registro';
    if (clientesQ.rows.length === 1) {
      return res.redirect(`/produtos/${destino}?id_cliente=${clientesQ.rows[0].id_cliente}`);
    }
    res.render('produtos/selecionar', { clientes: clientesQ.rows, destino });
  } catch (err) { next(err); }
});

// ===================== REGISTRO =====================

router.get('/registro', requireMenu('/produtos/registro'), async (req, res, next) => {
  try {
    const clientesQ = await fetchClientes(req);
    const rows = clientesQ.rows;

    let cliente = null;
    if (rows.length === 1) {
      cliente = rows[0];
    } else if (rows.length > 1) {
      if (req.query.id_cliente) {
        cliente = rows.find(c => c.id_cliente == req.query.id_cliente) || null;
      }
      if (!cliente) return res.redirect('/produtos/selecionar?destino=registro');
    }

    res.render('produtos/registro', { cliente, clienteUnico: rows.length === 1 });
  } catch (err) { next(err); }
});

// ===================== LISTA DO DIA =====================

router.get('/lista', requireMenu('/produtos/lista'), async (req, res, next) => {
  try {
    const clientesQ = await fetchClientes(req);
    const rows = clientesQ.rows;

    let cliente = null;
    if (rows.length === 1) {
      cliente = rows[0];
    } else if (rows.length > 1) {
      if (req.query.id_cliente) {
        cliente = rows.find(c => c.id_cliente == req.query.id_cliente) || null;
      }
      if (!cliente) return res.redirect('/produtos/selecionar?destino=lista');
    }

    let produtos = [];
    if (cliente) {
      const q = await pool.query(`
        SELECT p.*, u.nome as nome_usuario
        FROM produtos_coletados p
        JOIN usuarios u ON u.id_usuario = p.id_usuario
        WHERE p.id_cliente = $1
          AND p.dt_coleta = CURRENT_DATE
          AND ($2 OR p.id_usuario = $3)
        ORDER BY p.created_at DESC
      `, [cliente.id_cliente, req.user.admin, req.user.id_usuario]);
      produtos = q.rows;
    }

    res.render('produtos/lista', { cliente, clienteUnico: rows.length === 1, produtos });
  } catch (err) { next(err); }
});

module.exports = router;
