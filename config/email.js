const nodemailer = require('nodemailer');
const { pool }   = require('./database');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function notificarAdminsNovoUsuario(novoUsuario) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return;

  try {
    const result = await pool.query(
      'SELECT email FROM usuarios WHERE admin = true AND ativo = true'
    );

    // Filtra enderecos invalidos (ex: admin@ruptura.local do seed)
    const emailsValidos = result.rows
      .map(r => r.email)
      .filter(e => /^[^@]+@[^@]+\.[a-z]{2,}$/i.test(e) && !e.endsWith('.local'));

    if (emailsValidos.length === 0) return;

    const destinatarios = emailsValidos.join(', ');

    await transporter.sendMail({
      from:    process.env.EMAIL_FROM || process.env.SMTP_USER,
      to:      destinatarios,
      subject: '[Ruptura] Novo usuario aguardando ativacao',
      html: `
        <p>Um novo usuario foi cadastrado no sistema Ruptura e aguarda ativacao:</p>
        <ul>
          <li><strong>Nome:</strong> ${novoUsuario.nome}</li>
          <li><strong>Email:</strong> ${novoUsuario.email}</li>
        </ul>
        <p>
          Acesse <strong>Admin &rarr; Usuarios</strong>, clique no <strong>icone de lapis</strong>
          do usuario para ativa-lo e configurar as permissoes de menus e clientes.
        </p>
      `,
    });
  } catch (err) {
    console.error('Erro ao enviar e-mail de notificacao:', err.message);
  }
}

module.exports = { notificarAdminsNovoUsuario };
