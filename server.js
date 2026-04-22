require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

['database', 'uploads', 'public', 'admin'].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ────────────────────────────────────────
// DATABASE
// ────────────────────────────────────────
const db = new sqlite3.Database('./database/autocar.db', err => {
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
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
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

const agendamentoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' }
});

const requireAdmin = (req, res, next) =>
  req.session?.adminId ? next() : res.status(401).json({ error: 'Não autorizado' });

// ────────────────────────────────────────
// PUBLIC ROUTES
// ────────────────────────────────────────

app.get('/api/servicos', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM servicos WHERE ativo=1 ORDER BY id');
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/horarios', async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ error: 'Data obrigatória' });

    const hoje = new Date().toISOString().split('T')[0];
    const now = new Date();
    const horaAtual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const rows = await dbAll(`
      SELECT h.*,
        CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS reservado
      FROM horarios_disponiveis h
      LEFT JOIN agendamentos a
        ON a.data = h.data AND a.hora = h.hora AND a.status NOT IN ('cancelado')
      WHERE h.data = ? AND h.bloqueado = 0
      ORDER BY h.hora
    `, [data]);

    const filtered = rows.filter(h => {
      if (data > hoje) return true;
      if (data === hoje) return h.hora > horaAtual;
      return false;
    });

    res.json(filtered);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/horarios/mes', async (req, res) => {
  try {
    const { ano, mes } = req.query;
    if (!ano || !mes) return res.status(400).json({ error: 'Ano e mês obrigatórios' });

    const pad = String(mes).padStart(2, '0');
    const ini = `${ano}-${pad}-01`;
    const fim = `${ano}-${pad}-31`;
    const hoje = new Date().toISOString().split('T')[0];

    const rows = await dbAll(`
      SELECT h.data,
        COUNT(h.id) AS total,
        SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS reservados,
        SUM(h.bloqueado) AS bloqueados
      FROM horarios_disponiveis h
      LEFT JOIN agendamentos a
        ON a.data = h.data AND a.hora = h.hora AND a.status NOT IN ('cancelado')
      WHERE h.data BETWEEN ? AND ? AND h.data >= ?
      GROUP BY h.data
      HAVING (total - bloqueados - reservados) > 0
    `, [ini, fim, hoje]);

    res.json(rows.map(r => r.data));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/agendamentos', agendamentoLimiter, async (req, res) => {
  const { cliente_nome, cliente_telefone, carro_modelo, carro_placa,
    observacoes, data, hora, servicos_ids } = req.body;

  if (!cliente_nome || !cliente_telefone || !carro_modelo || !data || !hora || !servicos_ids?.length) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }

  const tel = String(cliente_telefone).replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 11) {
    return res.status(400).json({ error: 'Telefone inválido.' });
  }

  try {
    const ph = servicos_ids.map(() => '?').join(',');
    const servicos = await dbAll(
      `SELECT * FROM servicos WHERE id IN (${ph}) AND ativo=1`, servicos_ids);
    if (servicos.length !== servicos_ids.length) {
      return res.status(400).json({ error: 'Serviço inválido.' });
    }

    const duracao_total = servicos.reduce((s, x) => s + x.duracao_minutos, 0);
    const valor_total = servicos.reduce((s, x) => s + (x.preco || 0), 0);

    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN EXCLUSIVE TRANSACTION', async err => {
          if (err) { reject(err); return; }
          try {
            const slot = await dbGet(
              'SELECT id FROM horarios_disponiveis WHERE data=? AND hora=? AND bloqueado=0', [data, hora]);
            if (!slot) {
              db.run('ROLLBACK');
              res.status(400).json({ error: 'Horário não disponível.' });
              return resolve();
            }
            const existe = await dbGet(
              "SELECT id FROM agendamentos WHERE data=? AND hora=? AND status NOT IN ('cancelado')", [data, hora]);
            if (existe) {
              db.run('ROLLBACK');
              res.status(409).json({ error: 'Horário acabou de ser reservado. Escolha outro.' });
              return resolve();
            }
            const r = await dbRun(
              `INSERT INTO agendamentos
                (cliente_nome,cliente_telefone,carro_modelo,carro_placa,observacoes,data,hora,duracao_total,valor_total,status,visto_admin)
               VALUES (?,?,?,?,?,?,?,?,?,'pendente',0)`,
              [cliente_nome, tel, carro_modelo, carro_placa || null, observacoes || null,
                data, hora, duracao_total, valor_total || null]);

            for (const sid of servicos_ids) {
              await dbRun('INSERT INTO agendamentos_servicos VALUES (?,?)', [r.lastID, sid]);
            }
            db.run('COMMIT');
            res.json({ success: true, agendamento_id: r.lastID, duracao_total, valor_total: valor_total || null });
            resolve();
          } catch (e2) {
            db.run('ROLLBACK');
            reject(e2);
          }
        });
      });
    });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao criar agendamento.' });
  }
});

app.get('/api/avaliacoes', async (req, res) => {
  try {
    const rows = await dbAll(
      "SELECT id,nome,nota,comentario,criado_em FROM avaliacoes WHERE status='publicada' ORDER BY criado_em DESC LIMIT 20");
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/avaliacoes', async (req, res) => {
  try {
    const { nome, nota, comentario } = req.body;
    if (!nome || !nota || nota < 1 || nota > 5) {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    await dbRun("INSERT INTO avaliacoes (nome,nota,comentario,status) VALUES (?,?,?,'pendente')",
      [nome, parseInt(nota), comentario || null]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/config-publica', async (req, res) => {
  try {
    const rows = await dbAll(
      "SELECT chave,valor FROM configuracoes WHERE chave IN ('whatsapp_numero','endereco','horario_funcionamento')");
    const obj = {};
    rows.forEach(r => obj[r.chave] = r.valor);
    res.json(obj);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// ────────────────────────────────────────
// ADMIN ROUTES
// ────────────────────────────────────────

app.post('/api/admin/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    const user = await dbGet('SELECT * FROM admin_users WHERE usuario=?', [usuario]);
    if (!user || !(await bcrypt.compare(senha, user.senha_hash))) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }
    req.session.adminId = user.id;
    req.session.adminUsuario = user.usuario;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/me', requireAdmin, (req, res) =>
  res.json({ usuario: req.session.adminUsuario }));

app.get('/api/admin/agendamentos', requireAdmin, async (req, res) => {
  try {
    const { filtro } = req.query;
    const hoje = new Date().toISOString().split('T')[0];
    const em7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const filtros = {
      hoje: ['WHERE a.data=?', [hoje]],
      proximos7: ['WHERE a.data BETWEEN ? AND ?', [hoje, em7]],
      pendentes: ["WHERE a.status='pendente'", []],
      confirmados: ["WHERE a.status='confirmado'", []],
      concluidos: ["WHERE a.status='concluido'", []],
      cancelados: ["WHERE a.status='cancelado'", []]
    };
    const [where, params] = filtros[filtro] || ['', []];

    const rows = await dbAll(`
      SELECT a.*, GROUP_CONCAT(s.nome, ', ') AS servicos_nomes
      FROM agendamentos a
      LEFT JOIN agendamentos_servicos ags ON ags.agendamento_id = a.id
      LEFT JOIN servicos s ON s.id = ags.servico_id
      ${where}
      GROUP BY a.id
      ORDER BY a.data DESC, a.hora DESC
    `, params);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/admin/agendamentos/nao-vistos', requireAdmin, async (req, res) => {
  try {
    const r = await dbGet('SELECT COUNT(*) AS count FROM agendamentos WHERE visto_admin=0');
    res.json({ count: r.count });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/admin/agendamentos/marcar-visto', requireAdmin, async (req, res) => {
  try {
    await dbRun('UPDATE agendamentos SET visto_admin=1 WHERE visto_admin=0');
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.patch('/api/admin/agendamentos/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, visto_admin } = req.body;
    const valid = ['pendente', 'confirmado', 'concluido', 'cancelado'];

    if (status !== undefined) {
      if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
      await dbRun('UPDATE agendamentos SET status=? WHERE id=?', [status, id]);
    }
    if (visto_admin !== undefined) {
      await dbRun('UPDATE agendamentos SET visto_admin=? WHERE id=?', [visto_admin ? 1 : 0, id]);
    }
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/admin/agendamentos/:id', requireAdmin, async (req, res) => {
  try {
    const ag = await dbGet('SELECT * FROM agendamentos WHERE id=?', [req.params.id]);
    if (!ag) return res.status(404).json({ error: 'Não encontrado' });
    const servicos = await dbAll(`
      SELECT s.nome, s.preco, s.duracao_minutos FROM agendamentos_servicos ags
      JOIN servicos s ON s.id = ags.servico_id WHERE ags.agendamento_id=?`, [ag.id]);
    res.json({ ...ag, servicos });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/admin/servicos', requireAdmin, async (req, res) => {
  try {
    res.json(await dbAll('SELECT * FROM servicos ORDER BY id'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/admin/servicos', requireAdmin, async (req, res) => {
  try {
    const { nome, descricao, preco, duracao_minutos, imagem_path, ativo } = req.body;
    if (!nome || !duracao_minutos) return res.status(400).json({ error: 'Nome e duração obrigatórios.' });
    const r = await dbRun(
      'INSERT INTO servicos (nome,descricao,preco,duracao_minutos,imagem_path,ativo) VALUES (?,?,?,?,?,?)',
      [nome, descricao || null, preco || null, duracao_minutos, imagem_path || null, ativo !== false ? 1 : 0]);
    res.json({ success: true, id: r.lastID });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.put('/api/admin/servicos/:id', requireAdmin, async (req, res) => {
  try {
    const { nome, descricao, preco, duracao_minutos, imagem_path, ativo } = req.body;
    await dbRun(
      'UPDATE servicos SET nome=?,descricao=?,preco=?,duracao_minutos=?,imagem_path=?,ativo=? WHERE id=?',
      [nome, descricao || null, preco || null, duracao_minutos, imagem_path || null, ativo ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.delete('/api/admin/servicos/:id', requireAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM agendamentos_servicos WHERE servico_id=?', [req.params.id]);
    await dbRun('DELETE FROM servicos WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/admin/servicos/upload', requireAdmin, upload.single('imagem'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

app.get('/api/admin/horarios', requireAdmin, async (req, res) => {
  try {
    const { data } = req.query;
    if (data) {
      const rows = await dbAll(`
        SELECT h.*,
          CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS reservado,
          a.cliente_nome, a.id AS agendamento_id, a.status AS agendamento_status
        FROM horarios_disponiveis h
        LEFT JOIN agendamentos a ON a.data=h.data AND a.hora=h.hora AND a.status NOT IN ('cancelado')
        WHERE h.data=? ORDER BY h.hora`, [data]);
      res.json(rows);
    } else {
      res.json(await dbAll('SELECT * FROM horarios_disponiveis ORDER BY data,hora'));
    }
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/admin/horarios', requireAdmin, async (req, res) => {
  try {
    const { data, hora, bloqueado } = req.body;
    if (!data || !hora) return res.status(400).json({ error: 'Data e hora obrigatórios.' });
    await dbRun('INSERT OR REPLACE INTO horarios_disponiveis (data,hora,bloqueado) VALUES (?,?,?)',
      [data, hora, bloqueado ? 1 : 0]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/admin/horarios/bulk', requireAdmin, async (req, res) => {
  try {
    const { datas, horas } = req.body;
    if (!datas?.length || !horas?.length) return res.status(400).json({ error: 'Datas e horas obrigatórios.' });
    for (const data of datas) {
      for (const hora of horas) {
        await dbRun('INSERT OR REPLACE INTO horarios_disponiveis (data,hora,bloqueado) VALUES (?,?,0)', [data, hora]);
      }
    }
    res.json({ success: true, total: datas.length * horas.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.delete('/api/admin/horarios', requireAdmin, async (req, res) => {
  try {
    const { data, hora } = req.body;
    if (!data || !hora) return res.status(400).json({ error: 'Data e hora obrigatórios.' });
    await dbRun('DELETE FROM horarios_disponiveis WHERE data=? AND hora=?', [data, hora]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/admin/avaliacoes', requireAdmin, async (req, res) => {
  try {
    res.json(await dbAll('SELECT * FROM avaliacoes ORDER BY criado_em DESC'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.patch('/api/admin/avaliacoes/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pendente', 'publicada', 'oculta'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }
    await dbRun('UPDATE avaliacoes SET status=? WHERE id=?', [status, req.params.id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/admin/configuracoes', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM configuracoes');
    const obj = {};
    rows.forEach(r => obj[r.chave] = r.valor);
    res.json(obj);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.put('/api/admin/configuracoes', requireAdmin, async (req, res) => {
  try {
    for (const [k, v] of Object.entries(req.body)) {
      await dbRun('INSERT OR REPLACE INTO configuracoes (chave,valor) VALUES (?,?)', [k, v]);
    }
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

app.put('/api/admin/senha', requireAdmin, async (req, res) => {
  try {
    const { senha_atual, nova_senha } = req.body;
    if (!nova_senha || nova_senha.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter ao menos 6 caracteres.' });
    }
    const user = await dbGet('SELECT * FROM admin_users WHERE id=?', [req.session.adminId]);
    if (!(await bcrypt.compare(senha_atual, user.senha_hash))) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }
    const hash = await bcrypt.hash(nova_senha, 12);
    await dbRun('UPDATE admin_users SET senha_hash=? WHERE id=?', [hash, req.session.adminId]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// ────────────────────────────────────────
// PAGE ROUTES
// ────────────────────────────────────────
app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'admin', 'login.html')));

app.get('/admin/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html')));

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Endpoint não encontrado' });
  } else {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
});

app.listen(PORT, () => {
  console.log(`\n🚗 JS AutoCar rodando em http://localhost:${PORT}`);
  console.log(`🔧 Painel admin em http://localhost:${PORT}/admin\n`);
});
