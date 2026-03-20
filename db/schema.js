require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../config/database');

async function createSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Sessions table (connect-pg-simple)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT sessions_pkey PRIMARY KEY (sid)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire)
    `);

    // Usuarios
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario  SERIAL PRIMARY KEY,
        nome        VARCHAR(100) NOT NULL,
        email       VARCHAR(150) UNIQUE NOT NULL,
        senha       VARCHAR(255),
        google_id   VARCHAR(100) UNIQUE,
        admin       BOOLEAN NOT NULL DEFAULT false,
        ativo       BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Menus
    await client.query(`
      CREATE TABLE IF NOT EXISTS menus (
        id_menu   SERIAL PRIMARY KEY,
        descricao VARCHAR(100) NOT NULL,
        link      VARCHAR(200),
        icone     VARCHAR(60),
        ordem     INTEGER NOT NULL DEFAULT 0,
        grupo     VARCHAR(60)
      )
    `);

    // Clientes (ERPs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id_cliente      SERIAL PRIMARY KEY,
        nome            VARCHAR(150) NOT NULL,
        tipo_conexao    VARCHAR(20) NOT NULL CHECK (tipo_conexao IN ('oracle','postgres','mysql','endpoint')),
        host            VARCHAR(200),
        porta           INTEGER,
        banco_dados     VARCHAR(100),
        schema_bd       VARCHAR(100),
        sid             VARCHAR(100),
        usuario_bd      VARCHAR(100),
        senha_bd        VARCHAR(255),
        endpoint_url    VARCHAR(500),
        endpoint_token  VARCHAR(500),
        query_produto   TEXT,
        ativo           BOOLEAN NOT NULL DEFAULT true,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Permissao Menu
    await client.query(`
      CREATE TABLE IF NOT EXISTS permissao_menu (
        id_menu     INTEGER NOT NULL REFERENCES menus(id_menu) ON DELETE CASCADE,
        id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        PRIMARY KEY (id_menu, id_usuario)
      )
    `);

    // Permissao Cliente
    await client.query(`
      CREATE TABLE IF NOT EXISTS permissao_cliente (
        id_cliente  INTEGER NOT NULL REFERENCES clientes(id_cliente) ON DELETE CASCADE,
        id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        PRIMARY KEY (id_cliente, id_usuario)
      )
    `);

    // Produtos Coletados
    await client.query(`
      CREATE TABLE IF NOT EXISTS produtos_coletados (
        id               SERIAL,
        id_cliente       INTEGER NOT NULL REFERENCES clientes(id_cliente),
        codigo_produto   VARCHAR(50) NOT NULL,
        dt_coleta        DATE NOT NULL DEFAULT CURRENT_DATE,
        id_usuario       INTEGER NOT NULL REFERENCES usuarios(id_usuario),
        qt_coletada      NUMERIC(10,3),
        descricao        VARCHAR(255),
        erp_validado     BOOLEAN NOT NULL DEFAULT false,
        erp_dados        JSONB,
        created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id_cliente, codigo_produto, dt_coleta, id_usuario)
      )
    `);

    await client.query('COMMIT');
    console.log('Schema criado com sucesso.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar schema:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

createSchema().catch(() => process.exit(1));
