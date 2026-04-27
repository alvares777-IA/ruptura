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

function localDateISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ===================== SELEÇÃO DE CLIENTE =====================

router.get('/selecionar', async (req, res, next) => {
  try {
    const clientesQ = await fetchClientes(req);
    const destino = ['registro', 'lista'].includes(req.query.destino) ? req.query.destino : 'registro';
    if (clientesQ.rows.length === 1) {
      const id = clientesQ.rows[0].id_cliente;
      const redir = destino === 'lista'
        ? `/produtos/selecionar-data?id_cliente=${id}`
        : `/produtos/${destino}?id_cliente=${id}`;
      return res.redirect(redir);
    }
    res.render('produtos/selecionar', { clientes: clientesQ.rows, destino });
  } catch (err) { next(err); }
});

// ===================== SELEÇÃO DE DATA (lista) =====================

router.get('/selecionar-data', async (req, res, next) => {
  try {
    const clientesQ = await fetchClientes(req);
    const cliente = clientesQ.rows.find(c => c.id_cliente == req.query.id_cliente) || null;
    if (!cliente) return res.redirect('/produtos/selecionar?destino=lista');

    res.render('produtos/selecionar_data', {
      cliente,
      clienteUnico: clientesQ.rows.length === 1,
      hoje:  localDateISO(0),
      ontem: localDateISO(-1),
    });
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

    if (cliente && !req.query.dt_coleta) {
      return res.redirect(`/produtos/selecionar-data?id_cliente=${cliente.id_cliente}`);
    }

    const dtColeta = req.query.dt_coleta || localDateISO(0);

    let produtos = [];
    if (cliente) {
      const q = await pool.query(`
        SELECT p.*, u.nome as nome_usuario
        FROM produtos_coletados p
        JOIN usuarios u ON u.id_usuario = p.id_usuario
        WHERE p.id_cliente = $1
          AND p.dt_coleta = $4
          AND ($2 OR p.id_usuario = $3)
        ORDER BY p.created_at DESC
      `, [cliente.id_cliente, req.user.admin, req.user.id_usuario, dtColeta]);
      produtos = q.rows;
    }

    res.render('produtos/lista', {
      cliente,
      clienteUnico: rows.length === 1,
      dtColeta,
      produtos,
    });
  } catch (err) { next(err); }
});

module.exports = router;
