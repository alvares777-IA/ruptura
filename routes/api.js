const express = require('express');
const router  = express.Router();
const { pool } = require('../config/database');
const { buscarProduto } = require('../config/erp');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// POST /api/produtos/validar
router.post('/produtos/validar', async (req, res) => {
  const { id_cliente, codigo, qt_coletada } = req.body;

  if (!id_cliente || !codigo) {
    return res.status(400).json({ ok: false, msg: 'Informe o cliente e o codigo.' });
  }

  if (!req.user.admin) {
    const check = await pool.query(
      'SELECT 1 FROM permissao_cliente WHERE id_usuario=$1 AND id_cliente=$2',
      [req.user.id_usuario, id_cliente]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ ok: false, msg: 'Sem permissao para este cliente.' });
    }
  }

  try {
    const cliQ = await pool.query('SELECT * FROM clientes WHERE id_cliente=$1 AND ativo=true', [id_cliente]);
    if (cliQ.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: 'Cliente nao encontrado.' });
    }
    const cliente = cliQ.rows[0];

    const qt = qt_coletada ? parseFloat(qt_coletada) : null;
    console.log('\n--- produtos_coletados INSERT (teste manual) ---');
    console.log(`SELECT * FROM clientes WHERE id_cliente=${id_cliente} AND ativo=true;`);
    console.log(`INSERT INTO produtos_coletados (id_cliente,codigo_produto,dt_coleta,id_usuario,qt_coletada,descricao,erp_validado,erp_dados,updated_at) VALUES (${id_cliente},'${codigo}',CURRENT_DATE,${req.user.id_usuario},${qt ?? 'NULL'},'<descricao_erp>',true,'{}',NOW()) ON CONFLICT (id_cliente,codigo_produto,dt_coleta,id_usuario) DO UPDATE SET qt_coletada=EXCLUDED.qt_coletada,descricao=EXCLUDED.descricao,erp_validado=true,erp_dados=EXCLUDED.erp_dados,updated_at=NOW();`);
    console.log('------------------------------------------------\n');

    let produto;
    try {
      produto = await buscarProduto(cliente, codigo);
    } catch (erpErr) {
      console.error('Erro ERP:', erpErr.message);
      return res.status(502).json({ ok: false, msg: 'Erro ao conectar ao ERP: ' + erpErr.message });
    }

    if (!produto) {
      return res.status(404).json({ ok: false, msg: 'Produto nao encontrado no ERP.' });
    }

    await pool.query(`
      INSERT INTO produtos_coletados
        (id_cliente, codigo_produto, dt_coleta, id_usuario, qt_coletada, descricao, erp_validado, erp_dados, updated_at)
      VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,true,$6,NOW())
      ON CONFLICT (id_cliente, codigo_produto, dt_coleta, id_usuario)
      DO UPDATE SET
        qt_coletada  = EXCLUDED.qt_coletada,
        descricao    = EXCLUDED.descricao,
        erp_validado = true,
        erp_dados    = EXCLUDED.erp_dados,
        updated_at   = NOW()
    `, [id_cliente, codigo, req.user.id_usuario, qt, produto.descricao, JSON.stringify(produto.dados)]);

    return res.json({ ok: true, produto });
  } catch (err) {
    console.error('Erro ao validar produto:', err.message);
    return res.status(500).json({ ok: false, msg: 'Erro interno.' });
  }
});

// GET /api/produtos/consultar?id_cliente=&codigo=
router.get('/produtos/consultar', async (req, res) => {
  const { id_cliente, codigo } = req.query;
  if (!id_cliente || !codigo) {
    return res.status(400).json({ ok: false, msg: 'Informe o cliente e o codigo.' });
  }

  if (!req.user.admin) {
    const check = await pool.query(
      'SELECT 1 FROM permissao_cliente WHERE id_usuario=$1 AND id_cliente=$2',
      [req.user.id_usuario, id_cliente]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ ok: false, msg: 'Sem permissao para este cliente.' });
    }
  }

  try {
    const cliQ = await pool.query('SELECT * FROM clientes WHERE id_cliente=$1 AND ativo=true', [id_cliente]);
    if (cliQ.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: 'Cliente nao encontrado.' });
    }

    console.log('\n--- consultar EAN (preview) ---');
    console.log(`id_cliente=${id_cliente}  codigo=${codigo}  id_usuario=${req.user.id_usuario}`);
    console.log(`SELECT * FROM clientes WHERE id_cliente=${id_cliente} AND ativo=true;`);
    console.log('-------------------------------\n');

    let produto;
    try {
      produto = await buscarProduto(cliQ.rows[0], codigo);
    } catch (erpErr) {
      console.error('Erro ERP (consultar):', erpErr.message);
      return res.status(502).json({ ok: false, msg: 'Erro ao conectar ao ERP: ' + erpErr.message });
    }

    if (!produto) {
      return res.status(404).json({ ok: false, msg: 'Produto nao encontrado no ERP.' });
    }

    return res.json({ ok: true, produto });
  } catch (err) {
    console.error('Erro ao consultar produto:', err.message);
    return res.status(500).json({ ok: false, msg: 'Erro interno.' });
  }
});

// PUT /api/produtos/quantidade
router.put('/produtos/quantidade', async (req, res) => {
  const { id_cliente, codigo_produto, dt_coleta, id_usuario, qt_coletada, ao_coletado } = req.body;
  const targetUser = req.user.admin ? (id_usuario || req.user.id_usuario) : req.user.id_usuario;
  const ao = ['S', 'N'].includes(ao_coletado) ? ao_coletado : 'N';

  try {
    await pool.query(`
      UPDATE produtos_coletados
      SET qt_coletada=$1, ao_coletado=$6, updated_at=NOW()
      WHERE id_cliente=$2 AND codigo_produto=$3 AND dt_coleta=$4 AND id_usuario=$5
    `, [qt_coletada !== '' ? parseFloat(qt_coletada) : null, id_cliente, codigo_produto, dt_coleta, targetUser, ao]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao atualizar quantidade:', err.message);
    return res.status(500).json({ ok: false, msg: 'Erro interno.' });
  }
});

// PATCH /api/produtos/ao-coletado
router.patch('/produtos/ao-coletado', async (req, res) => {
  const { id_cliente, codigo_produto, dt_coleta, id_usuario } = req.body;
  const targetUser = req.user.admin ? (id_usuario || req.user.id_usuario) : req.user.id_usuario;

  try {
    const q = await pool.query(`
      UPDATE produtos_coletados
      SET ao_coletado = CASE WHEN ao_coletado = 'N' THEN 'S' ELSE 'N' END, updated_at = NOW()
      WHERE id_cliente=$1 AND codigo_produto=$2 AND dt_coleta=$3 AND id_usuario=$4
      RETURNING ao_coletado
    `, [id_cliente, codigo_produto, dt_coleta, targetUser]);

    if (q.rows.length === 0) return res.json({ ok: false, msg: 'Registro não encontrado.' });
    return res.json({ ok: true, ao_coletado: q.rows[0].ao_coletado });
  } catch (err) {
    console.error('Erro ao atualizar ao_coletado:', err.message);
    return res.status(500).json({ ok: false, msg: 'Erro interno.' });
  }
});

// DELETE /api/produtos
router.delete('/produtos', async (req, res) => {
  const { id_cliente, codigo_produto, dt_coleta, id_usuario } = req.body;
  const targetUser = req.user.admin ? (id_usuario || req.user.id_usuario) : req.user.id_usuario;

  try {
    await pool.query(`
      DELETE FROM produtos_coletados
      WHERE id_cliente=$1 AND codigo_produto=$2 AND dt_coleta=$3 AND id_usuario=$4
    `, [id_cliente, codigo_produto, dt_coleta, targetUser]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir produto:', err.message);
    return res.status(500).json({ ok: false, msg: 'Erro interno.' });
  }
});

// GET /api/produtos/detalhe?id_cliente=&codigo_produto=&dt_coleta=&id_usuario=
router.get('/produtos/detalhe', async (req, res) => {
  const { id_cliente, codigo_produto, dt_coleta, id_usuario } = req.query;
  const targetUser = req.user.admin ? (id_usuario || req.user.id_usuario) : req.user.id_usuario;

  try {
    const q = await pool.query(`
      SELECT * FROM produtos_coletados
      WHERE id_cliente=$1 AND codigo_produto=$2 AND dt_coleta=$3 AND id_usuario=$4
      LIMIT 1
    `, [id_cliente, codigo_produto, dt_coleta, targetUser]);

    if (q.rows.length === 0) return res.json({ ok: false, msg: 'Registro não encontrado.' });
    return res.json({ ok: true, produto: q.rows[0] });
  } catch (err) {
    console.error('Erro ao buscar detalhe:', err.message);
    return res.status(500).json({ ok: false, msg: 'Erro interno.' });
  }
});

// GET /api/produtos/lista?id_cliente=&dt_coleta=
router.get('/produtos/lista', async (req, res) => {
  const { id_cliente, dt_coleta } = req.query;
  if (!id_cliente) return res.status(400).json({ ok: false, msg: 'Informe o cliente.' });

  if (!req.user.admin) {
    const check = await pool.query(
      'SELECT 1 FROM permissao_cliente WHERE id_usuario=$1 AND id_cliente=$2',
      [req.user.id_usuario, id_cliente]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ ok: false, msg: 'Sem permissao para este cliente.' });
    }
  }

  try {
    const q = await pool.query(`
      SELECT p.*, u.nome as nome_usuario
      FROM produtos_coletados p
      JOIN usuarios u ON u.id_usuario = p.id_usuario
      WHERE p.id_cliente = $1
        AND p.dt_coleta = ${dt_coleta ? '$2' : 'CURRENT_DATE'}
        AND ($3 OR p.id_usuario = $4)
      ORDER BY p.updated_at DESC
    `, dt_coleta
      ? [id_cliente, dt_coleta, req.user.admin, req.user.id_usuario]
      : [id_cliente, req.user.admin, req.user.id_usuario]
    );
    return res.json({ ok: true, produtos: q.rows });
  } catch (err) {
    console.error('Erro ao buscar lista:', err.message);
    return res.status(500).json({ ok: false, msg: 'Erro interno.' });
  }
});

// GET /api/produtos/buscar?id_cliente=&codigo=
router.get('/produtos/buscar', async (req, res) => {
  const { id_cliente, codigo } = req.query;
  if (!id_cliente || !codigo) return res.status(400).json({ ok: false });

  try {
    const q = await pool.query(`
      SELECT * FROM produtos_coletados
      WHERE id_cliente=$1 AND codigo_produto=$2 AND dt_coleta=CURRENT_DATE
        AND ($3 OR id_usuario=$4)
      LIMIT 1
    `, [id_cliente, codigo, req.user.admin, req.user.id_usuario]);

    if (q.rows.length === 0) return res.json({ ok: false, msg: 'Produto nao encontrado na lista de hoje.' });
    return res.json({ ok: true, produto: q.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, msg: 'Erro interno.' });
  }
});

module.exports = router;
