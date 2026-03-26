# Ruptura — Sistema de Coleta de Produtos em Campo

Aplicação Node.js responsiva (mobile-first) para registro e gestão de coleta de produtos em campo, com leitura de código de barras EAN/DUN via câmera em Android e iOS.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Requisitos do Servidor](#2-requisitos-do-servidor)
3. [Configurar o PostgreSQL Local](#3-configurar-o-postgresql-local)
4. [Configurar o Git](#4-configurar-o-git)
5. [Instalação da Aplicação](#5-instalação-da-aplicação)
6. [Variáveis de Ambiente (.env)](#6-variáveis-de-ambiente-env)
7. [Configurar o Oracle Instant Client](#7-configurar-o-oracle-instant-client)
8. [Configurar "Entrar com Google" (OAuth2)](#8-configurar-entrar-com-google-oauth2)
9. [Configurar E-mail SMTP (Gmail com App Password)](#9-configurar-e-mail-smtp-gmail-com-app-password)
10. [Configurar PM2 (processo em produção)](#10-configurar-pm2-processo-em-produção)
11. [Configurar Nginx como Proxy Reverso](#11-configurar-nginx-como-proxy-reverso)
12. [Configurar HTTPS com Let's Encrypt](#12-configurar-https-com-lets-encrypt)
13. [Estrutura do Projeto](#13-estrutura-do-projeto)
14. [Banco de Dados da Aplicação](#14-banco-de-dados-da-aplicação)
15. [Sistema de Permissões](#15-sistema-de-permissões)
16. [Leitura de Códigos de Barras](#16-leitura-de-códigos-de-barras)
17. [Adicionar Novos Clientes / ERPs](#17-adicionar-novos-clientes--erps)
18. [Backup do Banco de Dados](#18-backup-do-banco-de-dados)
19. [Solução de Problemas](#19-solução-de-problemas)
20. [Testes Automatizados](#20-testes-automatizados)
    - [20.1 Estrutura dos arquivos](#201-estrutura-dos-arquivos-de-teste)
    - [20.2 Instalação](#202-instalação)
    - [20.3 Testes unitários (Jest)](#203-testes-unitários-jest--jsdom)
    - [20.4 Testes E2E (Playwright)](#204-testes-e2e-playwright)
    - [20.5 Fluxo recomendado](#205-fluxo-recomendado)

---

## 1. Visão Geral

| Item | Detalhe |
|------|---------|
| Runtime | Node.js >= 18 |
| Framework | Express + EJS + express-ejs-layouts |
| UI | Bootstrap 5 + jQuery |
| Auth | Passport.js (local + Google OAuth2) |
| Banco local | PostgreSQL >= 14 |
| ERPs suportados | Oracle, PostgreSQL, MySQL, Endpoint REST |
| Câmera | html5-qrcode (EAN-8, EAN-13, DUN-14/ITF, CODE-128) |

---

## 2. Requisitos do Servidor

```bash
# Ubuntu / Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential unzip

# Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # deve mostrar v20.x.x
npm -v

# PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Nginx (proxy reverso)
sudo apt install -y nginx
sudo systemctl enable nginx
```

```bash
# Oracle Linux 9 / RHEL 9 / Rocky Linux 9 / AlmaLinux 9
sudo dnf update -y
sudo dnf install -y curl git gcc-c++ make unzip

# Node.js 20 LTS via NodeSource
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v   # deve mostrar v20.x.x
npm -v

# PostgreSQL 16 (repositório oficial PGDG)
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm
sudo dnf -qy module disable postgresql   # desativa o módulo padrão do distro
sudo dnf install -y postgresql16-server postgresql16-contrib
sudo /usr/pgsql-16/bin/postgresql-16-setup initdb
sudo systemctl enable postgresql-16
sudo systemctl start postgresql-16

# Nginx (proxy reverso)
sudo dnf install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Firewall: liberar HTTP e HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

## 3. Configurar o PostgreSQL Local

### 3.1 Criar usuário e banco

```bash
# Acessa o prompt do postgres
sudo -u postgres psql

-- Dentro do psql:
CREATE USER ruptura WITH PASSWORD 'uss05777';
CREATE DATABASE ruptura OWNER ruptura;
GRANT ALL PRIVILEGES ON DATABASE ruptura TO ruptura;
\q
```

### 3.2 Ajustar autenticação (pg_hba.conf)

Por padrão o PostgreSQL exige autenticação por peer para conexões locais.
Para que a aplicação Node.js conecte via senha (md5/scram), verifique o arquivo:

```bash
# Ubuntu / Debian
sudo nano /etc/postgresql/16/main/pg_hba.conf

# Oracle Linux 9 / RHEL 9
sudo nano /var/lib/pgsql/16/data/pg_hba.conf
```

Certifique-se de que a linha referente a conexões locais via TCP use `scram-sha-256` ou `md5`:

```
# TYPE  DATABASE  USER      ADDRESS     METHOD
host    all       all       127.0.0.1/32  scram-sha-256
host    all       all       ::1/128       scram-sha-256
```

Após editar, recarregue:

```bash
sudo systemctl reload postgresql
```

### 3.3 Testar a conexão

```bash
psql "postgres://ruptura:uss05777@localhost:5432/ruptura" -c "SELECT version();"
```

### 3.4 String de conexão para o .env

```
DATABASE_URL=postgres://ruptura:uss05777@localhost:5432/ruptura
```

---

## 4. Configurar o Git

### 4.1 Instalar e configurar identidade

```bash
# Ubuntu / Debian
sudo apt install -y git

# Oracle Linux 9 / RHEL 9
sudo dnf install -y git

git config --global user.name  "Seu Nome"
git config --global user.email "seu@email.com"
git config --global init.defaultBranch main
git config --global core.autocrlf input   # evita problemas de CRLF no Windows/WSL
```

### 4.2 Inicializar o repositório

```bash
cd /opt/ruptura          # ou o caminho onde ficará a aplicação
git init
git add .
git commit -m "feat: versao inicial do Ruptura"
```

### 4.3 Conectar a um repositório remoto (GitHub / GitLab / Gitea)

```bash
# Crie o repositório vazio no GitHub/GitLab e então:
git remote add origin git@github.com:sua-org/ruptura.git
git push -u origin main
```

### 4.4 Configurar chave SSH (recomendado)

```bash
# Gera par de chaves (aceite os defaults)
ssh-keygen -t ed25519 -C "seu@email.com"

# Exibe a chave pública — copie e adicione no GitHub > Settings > SSH Keys
cat ~/.ssh/id_ed25519.pub

# Testa conexão
ssh -T git@github.com
```

### 4.5 Arquivo .gitignore

Crie o arquivo `.gitignore` na raiz do projeto:

```
node_modules/
.env
*.log
.DS_Store
```

> **Nunca commite o arquivo `.env`** — ele contém senhas e segredos.

### 4.6 Atualizar a aplicação no servidor via Git

```bash
cd /opt/ruptura
git pull origin main
npm install --omit=dev
pm2 restart ruptura
```

---

## 5. Instalação da Aplicação

```bash
# 1. Clone o repositório (ou copie os arquivos)
sudo mkdir -p /opt/ruptura
sudo chown $USER:$USER /opt/ruptura
git clone git@github.com:sua-org/ruptura.git /opt/ruptura
cd /opt/ruptura

# 2. Instale as dependências
npm install

# 3. Configure o ambiente
cp .env.example .env
nano .env   # preencha todas as variáveis (ver seção 6)

# 4. Crie as tabelas no PostgreSQL
npm run db:schema

# 5. Popule os dados iniciais (admin + menus + cliente Oracle de teste)
npm run db:seed

# 6. Inicie em desenvolvimento
npm run dev

# 7. Ou inicie direto (produção sem PM2)
npm start
```

### Acesso inicial

| Campo | Valor padrão |
|-------|-------------|
| URL   | http://localhost:3000 |
| Email | `admin@ruptura.local` |
| Senha | `Admin@2024` |

> Troque a senha imediatamente após o primeiro login em **Admin > Usuários**.

---

## 6. Variáveis de Ambiente (.env)

Copie `.env.example` para `.env` e preencha cada variável:

```bash
cp .env.example .env
nano .env
```

| Variável | Obrigatória | Descrição |
|----------|:-----------:|-----------|
| `PORT` | não | Porta HTTP (padrão: 3000) |
| `NODE_ENV` | não | `development` ou `production` |
| `DATABASE_URL` | **sim** | String de conexão PostgreSQL da aplicação |
| `SESSION_SECRET` | **sim** | String aleatória longa para assinar cookies de sessão |
| `GOOGLE_CLIENT_ID` | não | ID OAuth2 do Google (habilita login com Google) |
| `GOOGLE_CLIENT_SECRET` | não | Secret OAuth2 do Google |
| `GOOGLE_CALLBACK_URL` | não | URL de callback do Google (padrão: `/auth/google/callback`) |
| `SMTP_HOST` | não | Servidor SMTP para envio de e-mails (ex: `smtp.gmail.com`) |
| `SMTP_PORT` | não | Porta SMTP (padrão: `587`) |
| `SMTP_SECURE` | não | `true` para SSL na porta 465, `false` para STARTTLS |
| `SMTP_USER` | não | Usuário/e-mail da conta SMTP |
| `SMTP_PASS` | não | Senha ou App Password da conta SMTP |
| `EMAIL_FROM` | não | Remetente dos e-mails (padrão: `noreply@ruptura.local`) |
| `ADMIN_EMAIL` | não | Email do admin criado pelo seed (padrão: `admin@ruptura.local`) |
| `ADMIN_SENHA` | não | Senha do admin criado pelo seed (padrão: `Admin@2024`) |

### Gerar SESSION_SECRET seguro

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Cole o resultado no `.env`:

```
SESSION_SECRET=a1b2c3d4e5f6...  (string de 96 caracteres)
```

---

## 7. Configurar o Oracle Instant Client

Necessário apenas se algum cliente utilizar conexão direta ao Oracle.

### 7.1 Download

Acesse a página oficial da Oracle e baixe o pacote **Basic Lite** para Linux x86-64:

```
Instant Client Downloads for Linux x86-64 (64-bit)
Arquivo: instantclient-basiclite-linux.x64-21.x.x.x.zip
```

> Requer conta Oracle (gratuita) para download.

### 7.2 Instalação no servidor

```bash
# Cria diretório
sudo mkdir -p /opt/oracle

# Descompacta
sudo unzip ~/instantclient-basiclite-linux.x64-21.*.zip -d /opt/oracle

# Configura o linker
echo /opt/oracle/instantclient_21_x | sudo tee /etc/ld.so.conf.d/oracle-instantclient.conf
sudo ldconfig

# Verifica
ls /opt/oracle/instantclient_21_x/
```

### 7.3 Dependência libaio

```bash
# Ubuntu / Debian
sudo apt install -y libaio1

# Oracle Linux 9 / RHEL 9
sudo dnf install -y libaio
```

### 7.4 Variável de ambiente (opcional)

Se o oracledb não encontrar o client automaticamente, adicione no `.env`:

```
LD_LIBRARY_PATH=/opt/oracle/instantclient_21_x
```

Ou configure no `ecosystem.config.js` do PM2 (ver seção 9).

### 7.5 Testar conexão Oracle

```bash
node -e "
const oracledb = require('oracledb');
oracledb.getConnection({
  user: 'geral', password: 'x77plus',
  connectString: '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=192.168.70.184)(PORT=1531))(CONNECT_DATA=(SID=CPGESTOR)(SERVER=DEDICATED)))'
}).then(c => { console.log('OK'); c.close(); }).catch(console.error);
"
```

---

## 8. Configurar "Entrar com Google" (OAuth2)

### 8.1 Criar projeto no Google Cloud Console

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Clique em **Selecionar projeto** → **Novo projeto**
3. Dê um nome (ex.: `Ruptura`) e clique em **Criar**

### 8.2 Ativar a API do Google

1. No menu lateral: **APIs e serviços** → **Biblioteca**
2. Pesquise por **Google+ API** (ou **People API**) → **Ativar**

### 8.3 Configurar a Tela de Consentimento OAuth

1. **APIs e serviços** → **Tela de consentimento OAuth**
2. Tipo de usuário: **Externo** → **Criar**
3. Preencha:
   - Nome do app: `Ruptura`
   - Email de suporte: seu email
   - Logotipo: opcional
4. Em **Escopos**: clique em **Adicionar ou remover escopos** → adicione:
   - `openid`
   - `email`
   - `profile`
5. **Salvar e continuar** em todas as etapas

### 8.4 Criar Credenciais OAuth2

1. **APIs e serviços** → **Credenciais** → **+ Criar credenciais** → **ID do cliente OAuth**
2. Tipo de aplicativo: **Aplicativo da Web**
3. Nome: `Ruptura Web`
4. **Origens JavaScript autorizadas** — adicione:
   - Para desenvolvimento: `http://localhost:3000`
   - Para produção: `https://seudominio.com`
5. **URIs de redirecionamento autorizados** — adicione:
   - Para desenvolvimento: `http://localhost:3000/auth/google/callback`
   - Para produção: `https://seudominio.com/auth/google/callback`
6. Clique em **Criar**
7. Copie o **ID do cliente** e o **Secret do cliente**

### 8.5 Obter e configurar as credenciais

Após clicar em **Criar**, o Google exibe uma janela com apenas o **ID do cliente**.
O **Secret do cliente** não aparece nessa tela — obtenha por um dos caminhos abaixo:

**Opção A (mais fácil) — Baixar o JSON:**
Ainda na janela "Cliente OAuth criado", clique em **Baixar o JSON**.
O arquivo contém os dois valores:
```json
{
  "client_id": "862354775509-xxxx.apps.googleusercontent.com",
  "client_secret": "GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Opção B — Página de detalhes da credencial:**
Clique em **OK** para fechar → acesse **APIs e serviços** → **Credenciais** →
clique no **ícone de lápis** na credencial recém-criada → o Secret está visível na página de detalhes.

Preencha os valores no `.env`:

```
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_CALLBACK_URL=https://seudominio.com/auth/google/callback
```

### 8.6 Comportamento no sistema

- Ao logar via Google pela primeira vez, o usuário é **criado automaticamente** com `admin=false` e `ativo=false` (inativo).
- Um e-mail é enviado para todos os administradores ativos solicitando a ativação e configuração de permissões.
- O admin deverá ativar o usuário em **Admin > Usuários** e conceder permissões em **Admin > Permissões**.
- Se o email já existir no banco (cadastrado manualmente), o `google_id` é vinculado automaticamente.
- O botão "Entrar com Google" aparece sempre na tela de login.

---

## 9. Configurar E-mail SMTP (Gmail com App Password)

O sistema envia e-mail para os administradores sempre que um novo usuário se cadastra,
solicitando ativação e configuração de permissões.

### 9.1 Pré-requisito: ativar verificação em 2 etapas

Acesse [myaccount.google.com](https://myaccount.google.com) → **Segurança** → **Verificação em 2 etapas** → ativar.
Sem isso, a opção de App Password não aparece.

### 9.2 Gerar o App Password

1. Acesse [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Em **Nome do app**, digite `Ruptura` → clique em **Criar**
3. O Google gera uma senha de **16 caracteres** (ex: `abcd efgh ijkl mnop`)

> A senha é exibida **apenas uma vez**. Copie imediatamente.
> Se perder, basta revogar e gerar uma nova no mesmo endereço.

### 9.3 Configurar no .env

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seuemail@gmail.com
SMTP_PASS=abcdefghijklmnop
EMAIL_FROM=seuemail@gmail.com
```

> Cole a senha **sem espaços** — o Google exibe com espaços apenas para facilitar a leitura.

---

## 10. Configurar PM2 (processo em produção)

O PM2 mantém a aplicação rodando em background, reinicia automaticamente em caso de crash e sobe junto com o sistema.

### 9.1 Instalar PM2

```bash
sudo npm install -g pm2
```

### 9.2 Criar arquivo de configuração

Crie `/opt/ruptura/ecosystem.config.js`:

```js
module.exports = {
  apps: [{
    name:        'ruptura',
    script:      'server.js',
    cwd:         '/opt/ruptura',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV:          'production',
      PORT:              3000,
      LD_LIBRARY_PATH:   '/opt/oracle/instantclient_21_x',
    },
    env_file: '/opt/ruptura/.env',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file:  '/var/log/ruptura/error.log',
    out_file:    '/var/log/ruptura/out.log',
  }],
};
```

### 9.3 Criar diretório de logs e iniciar

```bash
sudo mkdir -p /var/log/ruptura
sudo chown $USER:$USER /var/log/ruptura

cd /opt/ruptura
pm2 start ecosystem.config.js
pm2 save                        # salva a lista de processos
pm2 startup                     # gera comando para autostart no boot
# Copie e execute o comando gerado pelo pm2 startup
```

### 9.4 Comandos úteis do PM2

```bash
pm2 list                # lista processos
pm2 logs ruptura        # logs em tempo real
pm2 restart ruptura     # reinicia
pm2 reload ruptura      # reinicia sem downtime (zero-downtime reload)
pm2 stop ruptura        # para
pm2 delete ruptura      # remove do PM2
pm2 monit               # monitor interativo
```

---

## 11. Configurar Nginx como Proxy Reverso

### 10.1 Criar configuração do site

**Ubuntu / Debian** — usa `sites-available` + `sites-enabled`:

```bash
sudo nano /etc/nginx/sites-available/ruptura
```

Conteúdo (igual para ambos os sistemas):

```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    # Logs
    access_log /var/log/nginx/ruptura_access.log;
    error_log  /var/log/nginx/ruptura_error.log;

    # Limite de upload (para futuros usos)
    client_max_body_size 10M;

    # Proxy para o Node.js
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
```

**Oracle Linux 9 / RHEL 9** — usa `conf.d` (sem symlink):

```bash
sudo nano /etc/nginx/conf.d/ruptura.conf
# Cole o mesmo bloco server { ... } acima e salve
```

### 10.2 Ativar o site

```bash
# Ubuntu / Debian
sudo ln -s /etc/nginx/sites-available/ruptura /etc/nginx/sites-enabled/
sudo nginx -t          # testa a configuração
sudo systemctl reload nginx

# Oracle Linux 9 / RHEL 9
# Não precisa de symlink — basta testar e recarregar
sudo nginx -t
sudo systemctl reload nginx

# OL9/RHEL9: permitir que o Nginx conecte a portas locais (SELinux)
sudo setsebool -P httpd_can_network_connect 1
```

---

## 12. Configurar HTTPS com Let's Encrypt

> **HTTPS é obrigatório em produção** para que a câmera funcione no iOS Safari e Android Chrome.

### 11.1 Instalar Certbot

```bash
# Ubuntu / Debian
sudo apt install -y certbot python3-certbot-nginx

# Oracle Linux 9 / RHEL 9
sudo dnf install -y epel-release
sudo dnf install -y certbot python3-certbot-nginx
```

### 11.2 Emitir certificado

```bash
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

O Certbot perguntará seu email e se deseja redirecionar HTTP para HTTPS — escolha **redirecionar** (opção 2).

### 11.3 Renovação automática

O Certbot já instala um timer systemd de renovação automática. Para testar:

```bash
sudo certbot renew --dry-run
```

### 11.4 Verificar resultado

Acesse `https://seudominio.com` e confirme o cadeado verde no browser.

Após o HTTPS, atualize o `.env`:

```
NODE_ENV=production
GOOGLE_CALLBACK_URL=https://seudominio.com/auth/google/callback
```

E reinicie a aplicação:

```bash
pm2 reload ruptura
```

---

## 13. Estrutura do Projeto

```
ruptura/
├── .env.example             # Modelo de variáveis de ambiente
├── .gitignore
├── package.json
├── server.js                # Entry point da aplicação
├── ecosystem.config.js      # Configuração PM2
│
├── config/
│   ├── database.js          # Pool de conexão PostgreSQL (app)
│   ├── erp.js               # Factory de conexão aos ERPs dos clientes
│   └── passport.js          # Estratégias: local + Google OAuth2
│
├── db/
│   ├── schema.js            # Criação das tabelas (npm run db:schema)
│   └── seed.js              # Dados iniciais: admin, menus, cliente Oracle
│
├── middleware/
│   ├── auth.js              # requireAuth, requireAdmin
│   └── permissions.js       # requireMenu, checkClienteAccess
│
├── routes/
│   ├── auth.js              # GET/POST /login, /logout, /auth/google
│   ├── admin.js             # /admin/usuarios, /clientes, /permissoes
│   ├── produtos.js          # /produtos/registro, /produtos/lista
│   ├── relatorios.js        # /relatorios (placeholder)
│   └── api.js               # REST: validar ERP, atualizar qtd, listar
│
├── views/
│   ├── layout.ejs           # Template base (navbar, flash, CDNs)
│   ├── login.ejs            # Página de login (fora do layout)
│   ├── dashboard.ejs        # Dashboard com cards de menu
│   ├── error.ejs            # Página de erro (403, 404, 500)
│   ├── admin/
│   │   ├── usuarios.ejs     # Gestão de usuários
│   │   ├── clientes.ejs     # Gestão de clientes/ERPs
│   │   └── permissoes.ejs   # Gestão de permissões (menu + cliente)
│   ├── produtos/
│   │   ├── registro.ejs     # Leitura de código + validação ERP
│   │   ├── lista.ejs        # Lista do dia com edição de quantidade
│   │   └── _card_produto.ejs # Partial: card de produto
│   └── relatorios/
│       └── index.ejs        # Placeholder "em desenvolvimento"
│
└── public/
    ├── css/custom.css       # Estilos mobile-first
    └── js/
        ├── main.js          # Utilitários globais (jQuery)
        └── scanner.js       # Wrapper html5-qrcode
```

---

## 14. Banco de Dados da Aplicação

### Tabelas

| Tabela | Chave Primária | Descrição |
|--------|---------------|-----------|
| `sessions` | `sid` | Sessões HTTP (connect-pg-simple) |
| `usuarios` | `id_usuario` (serial) | Usuários do sistema |
| `menus` | `id_menu` (serial) | Itens de menu disponíveis |
| `clientes` | `id_cliente` (serial) | Clientes / configurações de ERP |
| `permissao_menu` | `(id_menu, id_usuario)` | Acesso de usuário a menu |
| `permissao_cliente` | `(id_cliente, id_usuario)` | Acesso de usuário a cliente |
| `produtos_coletados` | `(id_cliente, codigo_produto, dt_coleta, id_usuario)` | Registros de coleta |

### Campos da tabela `clientes`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id_cliente` | SERIAL PK | Identificador |
| `nome` | VARCHAR(150) | Nome do cliente |
| `tipo_conexao` | VARCHAR(20) | `oracle`, `postgres`, `mysql` ou `endpoint` |
| `host` | VARCHAR(200) | IP ou hostname do servidor do ERP |
| `porta` | INTEGER | Porta do banco (ex: 1531 Oracle, 5432 PG) |
| `banco_dados` | VARCHAR(100) | Nome do banco (PG/MySQL) |
| `schema_bd` | VARCHAR(100) | Schema do banco |
| `sid` | VARCHAR(100) | SID Oracle |
| `usuario_bd` | VARCHAR(100) | Usuário de acesso ao ERP |
| `senha_bd` | VARCHAR(255) | Senha de acesso ao ERP |
| `endpoint_url` | VARCHAR(500) | URL REST — use `{codigo}` como placeholder |
| `endpoint_token` | VARCHAR(500) | Bearer token para o endpoint |
| `query_produto` | TEXT | Query de busca — `:1`/`$1` = código, `:2`/`$2` = id_bandeira |
| `id_bandeira` | VARCHAR(50) | Valor fixo passado como parâmetro `:2`/`$2` na query |
| `ativo` | BOOLEAN | Ativa/desativa o cliente no sistema |

### Upsert de produtos

Quando o mesmo usuário lê o mesmo código no mesmo dia para o mesmo cliente, o registro é **atualizado** (quantidade e timestamp) em vez de duplicado, graças ao `ON CONFLICT DO UPDATE`.

---

## 15. Sistema de Permissões

### Regras

- O usuário **admin** tem acesso irrestrito a tudo — sem precisar configurar permissões.
- Demais usuários precisam receber permissão de **menu** e de **cliente** individualmente.
- **Delegação em cascata**: um usuário só pode conceder a outro permissão em menus/clientes que ele próprio já possui. Ou seja, não aparece para ele nas telas de permissão o que ele não tem.

### Fluxo de configuração de um novo usuário

**Cadastro manual pelo admin:**
1. Admin cria o usuário em **Admin > Usuários** → botão **Novo**
2. O usuário é criado como **Inativo** por padrão
3. Admin clica no ícone de **lápis** (editar) no card do usuário
4. Na seção **Permissões** do modal, ativa os menus e clientes desejados
5. Marca o campo **Ativo** e salva — o usuário já pode logar

**Auto-cadastro via Google:**
1. Usuário clica em **Entrar com Google** — conta criada como **Inativa**
2. Administradores recebem e-mail automático solicitando ativação
3. Admin acessa **Admin > Usuários**, clica no ícone de **lápis** do usuário
4. Configura permissões de menus e clientes, marca **Ativo** e salva

### Ações disponíveis no card de cada usuário

| Ícone | Ação |
|-------|------|
| Lápis (azul) | Editar dados, ativo/admin e permissões de menus e clientes |
| Escudo +/− | Promover ou rebaixar administrador |
| Play/Pause | Ativar ou desativar o usuário |
| Chave | Redefinir senha |
| Lixeira | Excluir usuário e todos os seus dados |

---

## 16. Leitura de Códigos de Barras

O app suporta **três modos de leitura**, que coexistem sem conflito:

| Modo | Dispositivo | Como funciona |
|------|-------------|---------------|
| **Câmera** | Qualquer celular/tablet | Botão "Escanear" abre a câmera traseira |
| **BarcodeDetector nativo** | Chrome/Edge Android 83+ | Automático — substitui html5-qrcode quando disponível, muito mais rápido |
| **Wedge (infravermelho / laser / bluetooth)** | Coletores de dados industriais | Automático — nenhuma configuração necessária |

### Modo Wedge — Leitor infravermelho / laser

Coletores de dados com leitores dedicados (Zebra, Honeywell, Datalogic, Newland etc.) operam no **modo teclado (wedge)**: o scanner envia os dígitos do código de barras como teclas, seguidos de `Enter`.

Atenção:Precisa trocar de Broadcast para FOCUS em scantool Settings no coletor da COMPEX e ligar o endchar. 

**Funcionamento por tela:**

- **Tela de Registro** (`/produtos/registro`): o campo de código fica focado. O leitor escreve diretamente nele e o `Enter` aciona o registro automático — nenhum toque na tela necessário.
- **Tela de Lista** (`/produtos/lista`): o listener global de wedge detecta a leitura (nenhum campo de texto precisa estar focado) e busca o produto automaticamente.

**Como o wedge é detectado:**
Scanners enviam todos os dígitos em < 10 ms entre teclas. O código distingue leitura de scanner de digitação humana pelo intervalo entre teclas consecutivas (threshold: 50 ms). Se um campo de texto estiver focado, o listener não interfere — os chars vão normalmente para o campo.

**Configuração no coletor:**
Nenhuma. O modo padrão da maioria dos coletores é wedge com sufixo `Enter`, que já é compatível.
Se o seu coletor estiver configurado com sufixo `Tab` ou sem sufixo, ajuste nas configurações do scanner do aparelho para `Enter` (CR / `\r`).

### Modo Câmera — Biblioteca

Usa [html5-qrcode](https://github.com/mebjas/html5-qrcode) via CDN (sem instalação local).
Em dispositivos com Chrome/Edge Android 83+, usa `BarcodeDetector` nativo do SO (mais rápido e preciso).

### Formatos suportados

| Formato | Uso |
|---------|-----|
| EAN-13 | Código de barras padrão de produtos |
| EAN-8 | Versão curta do EAN |
| DUN-14 / ITF | Código de caixa/palete |
| CODE-128 | Código alfanumérico geral |
| CODE-39 | Industrial |
| QR Code | Bônus |

### Requisitos para câmera

- **HTTPS obrigatório em produção** — browsers modernos só liberam `getUserMedia` em origens seguras.
- Em desenvolvimento (`localhost`) funciona sem HTTPS.
- Testado em: Chrome (Android), Safari (iOS 14.3+), Samsung Internet.

### Desktop

No desktop o campo de código fica sempre visível para digitação manual. O botão de câmera aparece, mas em desktops sem câmera o browser informará erro. Leitores USB/bluetooth em modo wedge funcionam normalmente.

---

## 17. Adicionar Novos Clientes / ERPs

1. Acesse **Admin > Clientes** → **Novo**
2. Preencha o tipo de conexão e os dados de acesso
3. Preencha o **ID Bandeira** (opcional) — valor fixo passado como segundo parâmetro da query (`:2` / `$2`)
4. Preencha a **Query de busca de produto**:
   - Oracle: `SELECT DESCRICAO FROM PRODUTOS WHERE CODIGOEAN = :1 AND ID_BANDEIRA = :2 AND ROWNUM = 1`
   - PostgreSQL/MySQL: `SELECT descricao FROM produtos WHERE codigo_ean = $1 AND id_bandeira = $2 LIMIT 1`
   - Endpoint REST: configure a URL com `{codigo}` como placeholder
   - `:1`/`$1` = código EAN/DUN lido em campo; `:2`/`$2` = valor de `id_bandeira` do cadastro do cliente
5. Salve e acesse **Admin > Usuários** → ícone de lápis do usuário → seção **Permissões** para liberar o cliente

### Campos de conexão por tipo

| Campo | Oracle | PostgreSQL | MySQL | Endpoint |
|-------|:------:|:----------:|:-----:|:--------:|
| Host | ✓ | ✓ | ✓ | — |
| Porta | ✓ | ✓ | ✓ | — |
| SID/Banco | SID | banco | banco | — |
| Schema | ✓ | ✓ | — | — |
| Usuário BD | ✓ | ✓ | ✓ | — |
| Senha BD | ✓ | ✓ | ✓ | — |
| ID Bandeira | ✓ | ✓ | ✓ | — |
| URL endpoint | — | — | — | ✓ |
| Token | — | — | — | ✓ |

---

## 18. Backup do Banco de Dados

### Backup manual

```bash
pg_dump -U ruptura -h localhost ruptura > /opt/backups/ruptura_$(date +%Y%m%d_%H%M).sql
```

### Backup automatizado via cron

```bash
sudo mkdir -p /opt/backups/ruptura
sudo chown $USER:$USER /opt/backups/ruptura

crontab -e
```

Adicione a linha (backup diário às 3h da manhã, mantém 30 dias):

```
0 3 * * * pg_dump -U ruptura -h localhost ruptura | gzip > /opt/backups/ruptura/ruptura_$(date +\%Y\%m\%d).sql.gz && find /opt/backups/ruptura/ -name "*.sql.gz" -mtime +30 -delete
```

### Restaurar

```bash
# Descompactar se necessário
gunzip ruptura_20250101.sql.gz

# Restaurar
psql -U ruptura -h localhost ruptura < ruptura_20250101.sql
```

---

## 19. Solução de Problemas

### Câmera não abre no celular

- Verifique se a aplicação está em **HTTPS**. Em HTTP, iOS e Android bloqueiam `getUserMedia`.
- No iOS Safari, acesse **Ajustes > Safari > Câmera** e permita o acesso.
- No Android Chrome, toque no ícone de cadeado na barra de endereço e habilite câmera.

### Login com Google retorna erro de redirect_uri

- Certifique-se de que a URI de callback no Google Cloud Console corresponde **exatamente** ao `GOOGLE_CALLBACK_URL` no `.env`, incluindo `http`/`https` e a porta se houver.

### Erro "Cannot connect to Oracle"

- Verifique se o Oracle Instant Client está instalado e `ldconfig` foi executado.
- Teste a conectividade de rede: `telnet 192.168.70.184 1531`
- Verifique `LD_LIBRARY_PATH` no ambiente do processo Node.js.

### Erro NJS-138: connections to this database server version are not supported (Thin mode)

O `oracledb` por padrão usa **Thin mode**, que não suporta Oracle 11g e versões anteriores. A aplicação já inicializa o **Thick mode** automaticamente na inicialização, mas isso requer o Oracle Instant Client instalado no servidor.

```bash
# Verifique se o Instant Client foi encontrado nos logs ao iniciar:
# "oracledb: Thick mode ativado."

# Se não aparecer, defina o caminho explicitamente no .env:
ORACLE_CLIENT_PATH=/opt/oracle/instantclient_21_x
```

### Query Oracle com ponto-e-vírgula (`;`) causa erro

O driver Oracle rejeita queries terminadas com `;`. A aplicação remove o `;` automaticamente antes de executar. Mas ao salvar a query no cadastro do cliente, tanto com quanto sem `;` funciona.

### Erro de login sem mensagem no console ("credenciais inválidas")

Causado por nome de campo de senha incorreto no Passport. O campo do formulário é `senha` e o Passport precisa ser configurado com `passwordField: 'senha'`. Verifique em [config/passport.js](config/passport.js):

```js
new LocalStrategy({ usernameField: 'email', passwordField: 'senha' }, ...)
```

### Tabelas não existem (erro ao iniciar)

```bash
npm run db:schema   # recria as tabelas (se não existirem)
npm run db:seed     # recria admin e menus
```

### Sessões expiram muito rápido ou não persistem

- Verifique se a tabela `sessions` existe no PostgreSQL.
- Confirme `SESSION_SECRET` igual entre deploys.
- Em produção, `NODE_ENV=production` é obrigatório para cookies seguros via HTTPS.

### Ver logs da aplicação

```bash
pm2 logs ruptura            # logs em tempo real
pm2 logs ruptura --lines 200  # últimas 200 linhas
tail -f /var/log/ruptura/error.log
```

### Reiniciar tudo

```bash
pm2 reload ruptura
sudo systemctl reload nginx
```

---

---

## 20. Testes Automatizados

O projeto possui duas camadas de testes:

| Camada | Ferramenta | Requer servidor? | Requer banco? |
|--------|-----------|:---:|:---:|
| Unitário | Jest + jsdom | Não | Não |
| E2E (ponta a ponta) | Playwright | **Sim** | **Sim** |

---

### 20.1 Estrutura dos arquivos de teste

```
ruptura/
├── jest.config.js              ← configuração do Jest
├── playwright.config.js        ← configuração do Playwright
└── tests/
    ├── unit/
    │   ├── main.test.js        ← testes de public/js/main.js
    │   └── scanner.test.js     ← testes de public/js/scanner.js
    └── e2e/
        ├── auth.spec.js        ← fluxos de autenticação
        └── produtos.spec.js    ← fluxos de registro de produto
```

---

### 20.2 Instalação

Instale as dependências de desenvolvimento (já incluídas no `package.json`):

```bash
npm install
```

Para os testes E2E, instale o navegador Chromium do Playwright (só é necessário uma vez):

```bash
npx playwright install chromium
```

---

### 20.3 Testes unitários (Jest + jsdom)

Testam isoladamente a lógica dos scripts JavaScript do frontend — sem precisar de servidor, banco ou navegador real. O jsdom simula o DOM do navegador em memória.

#### O que é testado

**`tests/unit/main.test.js`** — comportamentos de `public/js/main.js`:
- Auto-dismiss de alertas `.alert-success` e `.alert-info` após 5 segundos
- Bloqueio de submit com `data-confirm` quando o usuário cancela a confirmação
- Spinner no botão de submit e restauração automática após 10 s (failsafe)
- Filtro de teclado em inputs EAN: permite apenas dígitos 0–9 e Enter

**`tests/unit/scanner.test.js`** — comportamentos de `public/js/scanner.js`:
- Retorno seguro quando elementos do DOM estão ausentes
- Container da câmera começa oculto (`d-none`)
- Abertura e fechamento da câmera via botões
- Seleção automática do modo nativo (`BarcodeDetector`) quando disponível
- Uso do fallback (`Html5Qrcode`) em browsers sem `BarcodeDetector`
- Fechamento da câmera ao ocultar a aba (`visibilitychange`)
- Detecção de wedge (leitor infravermelho/laser): sequência de teclas rápidas + Enter

#### Como executar

```bash
# Executa todos os testes unitários
npm test

# Com saída detalhada (nome de cada caso de teste)
npm run test:unit

# Apenas um arquivo
npx jest tests/unit/scanner.test.js

# Modo watch — re-executa ao salvar qualquer arquivo
npx jest --watch
```

#### Saída esperada

```
PASS  tests/unit/main.test.js
  Auto-dismiss de alertas (5 s)
    ✓ alert-success ainda visível antes dos 5 s
    ✓ fadeOut iniciado após 5 s no alert-info
    ✓ alert-danger não é afetado pelo auto-dismiss
  Confirmação de ações destrutivas
    ✓ preventDefault quando confirm retorna false
    ...

PASS  tests/unit/scanner.test.js
  initScanner — inicialização
    ✓ retorna sem erro quando btnAbrir não existe no DOM
    ...

Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
```

---

### 20.4 Testes E2E (Playwright)

Abrem um navegador real (Chromium) e executam os fluxos de usuário como se fosse uma pessoa usando o sistema. As chamadas à API `/api/produtos/validar` são interceptadas via `page.route()` para não depender de ERP real.

#### Pré-requisitos

1. O servidor deve estar rodando localmente
2. Deve existir um usuário ativo no banco com email e senha conhecidos

#### Variáveis de ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `TEST_EMAIL` | E-mail do usuário de teste | `admin@empresa.com` |
| `TEST_PASSWORD` | Senha do usuário de teste | `senha123` |
| `BASE_URL` | URL base do servidor | `http://localhost:3000` |

#### O que é testado

**`tests/e2e/auth.spec.js`** — autenticação:
- Exibição do formulário de login e botão do Google
- Mensagem de erro com credenciais inválidas
- Redirecionamento para `/dashboard` após login bem-sucedido
- Toggle que mostra/oculta a senha
- Redirecionamento para `/login` ao tentar acessar rotas protegidas sem autenticação (`/dashboard`, `/produtos/registro`, `/admin/usuarios`, etc.)
- Logout e invalidação da sessão

**`tests/e2e/produtos.spec.js`** — registro de produtos:
- Estado inicial do formulário (botão Validar desabilitado)
- Habilitação do botão somente quando cliente **e** código estão preenchidos
- Fluxo de sucesso: resultado exibido, campos limpos após validação
- Fluxo de erro: toast com a mensagem de erro do servidor
- Acionamento da validação pressionando Enter no campo de código
- Visibilidade e comportamento do container do scanner

#### Como executar

**Terminal 1 — servidor:**
```bash
npm run dev
```

**Terminal 2 — testes:**
```bash
# Define credenciais e roda
TEST_EMAIL=seu@email.com TEST_PASSWORD=suasenha npm run test:e2e
```

Ou exportando antes:
```bash
export TEST_EMAIL=seu@email.com
export TEST_PASSWORD=suasenha

npm run test:e2e          # roda em Chromium desktop + Pixel 5
npm run test:e2e:ui       # abre interface visual para depuração
```

#### Variantes úteis

```bash
# Apenas a suite de autenticação
npx playwright test tests/e2e/auth.spec.js

# Apenas a suite de produtos
npx playwright test tests/e2e/produtos.spec.js

# Roda com o navegador visível (útil para depurar)
npx playwright test --headed

# Abre o relatório HTML do último run
npx playwright show-report
```

---

### 20.5 Fluxo recomendado

```
Alterou main.js ou scanner.js?       →  npm test
Alterou uma rota, view ou API?       →  npm run test:e2e
Antes de um commit ou deploy?        →  npm test && npm run test:e2e
```

---

## Histórico de Alterações

| Data | Alteração |
|------|-----------|
| Mar/2025 | Versão inicial |
| Mar/2025 | Correção: `passwordField: 'senha'` no Passport (login não funcionava) |
| Mar/2025 | Campo `id_bandeira` na tabela `clientes` — passado como parâmetro `:2`/`$2` na query do ERP |
| Mar/2025 | Edição de cliente: campo `senha_bd` não sobrescreve o banco se deixado vazio |
| Mar/2025 | Oracle: ativado Thick mode para suporte a Oracle < 12c; remoção automática de `;` final na query |
| Mar/2026 | Responsividade da tela de usuários no mobile: modal fullscreen em telas pequenas, truncamento de nomes longos nas listas de permissão, correção de layout flex nos botões de ação |
| Mar/2026 | Scanner: substituído html5-qrcode por BarcodeDetector nativo (Chrome/Edge Android) com fallback para outros browsers; câmera em 1080p sem restrição de `qrbox` |
| Mar/2026 | Adicionados comandos de instalação para Oracle Linux 9 / RHEL 9 (dnf, PostgreSQL 16 PGDG, Nginx conf.d, SELinux, Certbot via EPEL) |
| Mar/2026 | Testes automatizados: suite Jest (unitário, jsdom) para main.js e scanner.js; suite Playwright (E2E) para auth e registro de produtos |
