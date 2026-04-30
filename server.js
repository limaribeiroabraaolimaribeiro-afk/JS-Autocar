require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

<<<<<<< HEAD
const app  = express();
const PORT = process.env.PORT || 3000;

// Garante que pasta de uploads existe
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads', { recursive: true });

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
=======
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

['database', 'uploads', 'public', 'admin'].forEach(d => {
  if (!fs.existsSync(path.join(__dirname, d))) fs.mkdirSync(path.join(__dirname, d), { recursive: true });
});

// ────────────────────────────────────────
// DATABASE
// ────────────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, 'database', 'autocar.db'), err => {
  if (err) console.error('Erro DB:', err.message);
  else console.log('Banco de dados conectado.');
});

db.serialize(() => {
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');

  db.run(`CREATE TABLE IF NOT EXISTS servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    preco REAL,
    duracao_minutos INTEGER NOT NULL DEFAULT 60,
    imagem_path TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS horarios_disponiveis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    hora TEXT NOT NULL,
    bloqueado INTEGER NOT NULL DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(data, hora)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_nome TEXT NOT NULL,
    cliente_telefone TEXT NOT NULL,
    carro_modelo TEXT NOT NULL,
    carro_placa TEXT,
    observacoes TEXT,
    data TEXT NOT NULL,
    hora TEXT NOT NULL,
    duracao_total INTEGER NOT NULL DEFAULT 60,
    valor_total REAL,
    status TEXT NOT NULL DEFAULT 'pendente',
    visto_admin INTEGER NOT NULL DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS agendamentos_servicos (
    agendamento_id INTEGER NOT NULL,
    servico_id INTEGER NOT NULL,
    PRIMARY KEY (agendamento_id, servico_id),
    FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id),
    FOREIGN KEY (servico_id) REFERENCES servicos(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS avaliacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    nota INTEGER NOT NULL CHECK(nota >= 1 AND nota <= 5),
    comentario TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT
  )`);
});

// ────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────
const dbGet = (sql, p = []) => new Promise((res, rej) =>
  db.get(sql, p, (e, r) => e ? rej(e) : res(r)));

const dbAll = (sql, p = []) => new Promise((res, rej) =>
  db.all(sql, p, (e, r) => e ? rej(e) : res(r)));

const dbRun = (sql, p = []) => new Promise((res, rej) =>
  db.run(sql, p, function (e) { e ? rej(e) : res({ lastID: this.lastID, changes: this.changes }); }));

// ────────────────────────────────────────
// MIDDLEWARE
// ────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));
>>>>>>> 319aa271a239162ec0ea99cde9b58dc750ba19a7

// ─── STATIC ───────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin',   express.static(path.join(__dirname, 'admin')));

<<<<<<< HEAD
// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
=======
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (_, file, cb) => cb(null, `srv-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(f.mimetype)
      ? cb(null, true)
      : cb(new Error('Somente JPG, PNG ou WebP'))
});
>>>>>>> 319aa271a239162ec0ea99cde9b58dc750ba19a7

app.use('/api/admin',       require('./routes/admin'));
app.use('/api/services',    require('./routes/services'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/customers',   require('./routes/customers'));
app.use('/api/messages',    require('./routes/messages'));
app.use('/api/gallery',     require('./routes/gallery'));
app.use('/api/settings',    require('./routes/settings'));
app.use('/api/timeslots',   require('./routes/timeslots'));

// ─── PAGE ROUTES ──────────────────────────────────────────────────────────────
app.get('/admin', (_, res) =>
  res.sendFile(path.join(__dirname, 'admin', 'login.html')));

app.get('/admin/dashboard', (_, res) =>
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html')));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Endpoint não encontrado' });
  } else {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚗 JS AutoCar rodando em http://localhost:${PORT}`);
  console.log(`🔧 Painel admin: http://localhost:${PORT}/admin\n`);
});
