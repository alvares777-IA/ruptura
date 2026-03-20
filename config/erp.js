/**
 * Factory de conexoes aos ERPs dos clientes.
 * Suporta: oracle, postgres, mysql, endpoint (REST)
 */
const oracledb = require('oracledb');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');

// Cache de pools por id_cliente
const _pools = {};

/**
 * Busca produto no ERP do cliente pelo codigo EAN/DUN.
 * Retorna { descricao, dados } ou lanca erro.
 */
async function buscarProduto(cliente, codigo) {
  const { tipo_conexao } = cliente;

  if (tipo_conexao === 'endpoint') {
    return buscarProdutoEndpoint(cliente, codigo);
  }

  const query = cliente.query_produto ||
    'SELECT * FROM produtos WHERE codigo_ean = $1 OR codigo_dun = $1 LIMIT 1';

  if (tipo_conexao === 'oracle') return buscarOracleProduto(cliente, codigo, query);
  if (tipo_conexao === 'postgres') return buscarPostgresProduto(cliente, codigo, query);
  if (tipo_conexao === 'mysql') return buscarMysqlProduto(cliente, codigo, query);

  throw new Error('Tipo de conexao desconhecido: ' + tipo_conexao);
}

// ---------- Oracle ----------
async function buscarOracleProduto(cliente, codigo, query) {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user:             cliente.usuario_bd,
      password:         cliente.senha_bd,
      connectString:    buildOracleConnectString(cliente),
    });
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    const result = await conn.execute(query, [codigo]);
    if (!result.rows || result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      descricao: row.DESCRICAO || row.descricao || Object.values(row)[0] || codigo,
      dados: row,
    };
  } finally {
    if (conn) await conn.close();
  }
}

function buildOracleConnectString(cliente) {
  if (cliente.sid) {
    return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${cliente.host})(PORT=${cliente.porta || 1521}))(CONNECT_DATA=(SID=${cliente.sid})(SERVER=DEDICATED)))`;
  }
  return `${cliente.host}:${cliente.porta || 1521}/${cliente.banco_dados}`;
}

// ---------- PostgreSQL ----------
async function buscarPostgresProduto(cliente, codigo, query) {
  if (!_pools[cliente.id_cliente]) {
    _pools[cliente.id_cliente] = new Pool({
      host:     cliente.host,
      port:     cliente.porta || 5432,
      database: cliente.banco_dados,
      user:     cliente.usuario_bd,
      password: cliente.senha_bd,
    });
  }
  const pool = _pools[cliente.id_cliente];
  const result = await pool.query(query.replace(/:\d+/g, '$1'), [codigo]);
  if (!result.rows || result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    descricao: row.descricao || row.DESCRICAO || Object.values(row)[0] || codigo,
    dados: row,
  };
}

// ---------- MySQL ----------
async function buscarMysqlProduto(cliente, codigo, query) {
  const conn = await mysql.createConnection({
    host:     cliente.host,
    port:     cliente.porta || 3306,
    database: cliente.banco_dados,
    user:     cliente.usuario_bd,
    password: cliente.senha_bd,
  });
  try {
    const mysqlQuery = query.replace(/:\d+/g, '?').replace(/\$\d+/g, '?');
    const [rows] = await conn.execute(mysqlQuery, [codigo]);
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      descricao: row.descricao || row.DESCRICAO || Object.values(row)[0] || codigo,
      dados: row,
    };
  } finally {
    await conn.end();
  }
}

// ---------- Endpoint REST ----------
async function buscarProdutoEndpoint(cliente, codigo) {
  const https = require('https');
  const http = require('http');
  const url = new URL(cliente.endpoint_url.replace('{codigo}', encodeURIComponent(codigo)));
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      'Authorization': cliente.endpoint_token ? `Bearer ${cliente.endpoint_token}` : undefined,
      'Content-Type': 'application/json',
    },
  };
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 404 || !json) return resolve(null);
          resolve({
            descricao: json.descricao || json.nome || json.description || codigo,
            dados: json,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { buscarProduto };
