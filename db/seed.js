require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@ruptura.local';
    const adminSenha = process.env.ADMIN_SENHA || 'Admin@2024';
    const hash = await bcrypt.hash(adminSenha.trim().toLowerCase(), 12);

    await client.query(`
      INSERT INTO usuarios (nome, email, senha, admin, ativo)
      VALUES ($1, $2, $3, true, true)
      ON CONFLICT (email) DO UPDATE SET admin = true, ativo = true
    `, ['Administrador', adminEmail, hash]);

    console.log(`Admin: ${adminEmail} / ${adminSenha}`);

    // Menus
    const menus = [
      { descricao: 'Dashboard',             link: '/dashboard',          icone: 'bi-house',           ordem: 1,  grupo: null },
      { descricao: 'Registro de Produtos',  link: '/produtos/registro',  icone: 'bi-upc-scan',        ordem: 2,  grupo: 'Produtos' },
      { descricao: 'Lista do Dia',          link: '/produtos/lista',     icone: 'bi-list-check',      ordem: 3,  grupo: 'Produtos' },
      { descricao: 'Relatorios',            link: '/relatorios',         icone: 'bi-bar-chart',       ordem: 4,  grupo: null },
      { descricao: 'Usuarios',             link: '/admin/usuarios',     icone: 'bi-people',          ordem: 10, grupo: 'Admin' },
      { descricao: 'Clientes',             link: '/admin/clientes',     icone: 'bi-building',        ordem: 11, grupo: 'Admin' },
      { descricao: 'Permissoes',           link: '/admin/permissoes',   icone: 'bi-shield-check',    ordem: 12, grupo: 'Admin' },
    ];

    for (const m of menus) {
      await client.query(`
        INSERT INTO menus (descricao, link, icone, ordem, grupo)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [m.descricao, m.link, m.icone, m.ordem, m.grupo]);
    }

    // Oracle test client
    await client.query(`
      INSERT INTO clientes
        (nome, tipo_conexao, host, porta, sid, schema_bd, usuario_bd, senha_bd, query_produto, ativo)
      VALUES
        ($1, 'oracle', $2, 1531, 'CPGESTOR', 'ATACADO', 'geral', 'x77plus',
         $3, true)
      ON CONFLICT DO NOTHING
    `, [
      'ATACADO - Oracle (teste)',
      '192.168.70.184',
      `SELECT DESCRICAO, CODIGOINT FROM VELPRODUTOS WHERE CODIGOEAN = :1 OR CODIGODUN = :1 AND ROWNUM = 1`
    ]);

    await client.query('COMMIT');
    console.log('Seed concluido.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro no seed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
