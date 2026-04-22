require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');

if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads', { recursive: true });

const db = new sqlite3.Database('./database/autocar.db');

const run = (sql, p = []) => new Promise((res, rej) =>
  db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

async function seed() {
  console.log('Iniciando seed...');

  db.serialize(() => {
    db.run('PRAGMA journal_mode=WAL');
    db.run('PRAGMA foreign_keys=ON');
  });

  await run(`CREATE TABLE IF NOT EXISTS servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, descricao TEXT, preco REAL, duracao_minutos INTEGER NOT NULL DEFAULT 60,
    imagem_path TEXT, ativo INTEGER NOT NULL DEFAULT 1, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  await run(`CREATE TABLE IF NOT EXISTS horarios_disponiveis (
    id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, hora TEXT NOT NULL,
    bloqueado INTEGER NOT NULL DEFAULT 0, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(data,hora))`);

  await run(`CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_nome TEXT NOT NULL, cliente_telefone TEXT NOT NULL,
    carro_modelo TEXT NOT NULL, carro_placa TEXT, observacoes TEXT, data TEXT NOT NULL, hora TEXT NOT NULL,
    duracao_total INTEGER NOT NULL DEFAULT 60, valor_total REAL, status TEXT NOT NULL DEFAULT 'pendente',
    visto_admin INTEGER NOT NULL DEFAULT 0, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  await run(`CREATE TABLE IF NOT EXISTS agendamentos_servicos (
    agendamento_id INTEGER NOT NULL, servico_id INTEGER NOT NULL,
    PRIMARY KEY (agendamento_id, servico_id))`);

  await run(`CREATE TABLE IF NOT EXISTS avaliacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
    nota INTEGER NOT NULL CHECK(nota>=1 AND nota<=5), comentario TEXT,
    status TEXT NOT NULL DEFAULT 'pendente', criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  await run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  await run(`CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY, valor TEXT)`);

  // Services
  const servicos = [
    ['Limpeza Pesada Interna e Externa',
      'Lavagem completa com limpeza profunda interna e externa. Aspiração, higienização de bancos, limpeza de tapetes, vidros e carroceria.', 120.00, 120],
    ['Limpeza Detalhada',
      'Limpeza minuciosa com atenção a cada detalhe. Inclui limpeza de frisos, borrachas, plásticos e tratamento de couro.', 200.00, 180],
    ['Polimento de Faróis',
      'Recuperação da transparência e claridade dos faróis. Remove amarelamento e oxidação, melhorando a segurança e estética.', 80.00, 60],
    ['Enceramento',
      'Proteção e brilho para a pintura do seu veículo. Cera de alta qualidade que protege contra chuva ácida e raios UV.', 90.00, 90],
    ['Sistema Leva e Traz',
      'Serviço adicional de coleta e entrega do veículo na sua casa ou trabalho. Comodidade e praticidade para você.', 30.00, 30]
  ];

  for (const [nome, descricao, preco, duracao_minutos] of servicos) {
    await run(
      'INSERT OR IGNORE INTO servicos (nome,descricao,preco,duracao_minutos,ativo) VALUES (?,?,?,?,1)',
      [nome, descricao, preco, duracao_minutos]);
  }
  console.log('✓ Serviços criados');

  // Admin user
  const senhaInicial = process.env.ADMIN_SENHA_INICIAL || 'trocar123';
  const hash = await bcrypt.hash(senhaInicial, 12);
  await run('INSERT OR IGNORE INTO admin_users (usuario,senha_hash) VALUES (?,?)', ['admin', hash]);
  console.log(`✓ Admin criado: usuario=admin / senha=${senhaInicial}`);

  // Default configs
  const configs = [
    ['whatsapp_numero', process.env.WHATSAPP_NUMERO || '5547999999999'],
    ['endereco', 'Rua das Lavações, 123 - Centro, Sua Cidade - SC'],
    ['horario_funcionamento', 'Segunda a Sexta: 8h às 18h | Sábado: 8h às 14h']
  ];
  for (const [k, v] of configs) {
    await run('INSERT OR IGNORE INTO configuracoes (chave,valor) VALUES (?,?)', [k, v]);
  }
  console.log('✓ Configurações padrão criadas');

  // Sample reviews
  const avaliacoes = [
    ['Carlos Mendes', 5, 'Serviço impecável! Meu carro ficou como novo. Super recomendo!'],
    ['Ana Paula', 5, 'Atendimento excelente e preço justo. Voltarei com certeza!'],
    ['Roberto Silva', 4, 'Muito bom serviço. Carro ficou brilhando. Pontualidade nota 10.'],
    ['Fernanda Costa', 5, 'O polimento de faróis foi incrível, parece que instalaram faróis novos!'],
    ['João Pedro', 5, 'Sistema leva e traz é fantástico! Praticidade total, recomendo a todos.']
  ];
  for (const [nome, nota, comentario] of avaliacoes) {
    await run("INSERT OR IGNORE INTO avaliacoes (nome,nota,comentario,status) VALUES (?,?,?,'publicada')",
      [nome, nota, comentario]);
  }
  console.log('✓ Avaliações de exemplo criadas');

  // Generate available slots for the next 30 days (Mon-Sat, 8h-17h)
  const horas = ['08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00'];
  const hoje = new Date();
  for (let i = 1; i <= 45; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const dow = d.getDay(); // 0=sun, 6=sat
    if (dow === 0) continue; // skip Sunday
    const dateStr = d.toISOString().split('T')[0];
    const slots = dow === 6 ? horas.slice(0, 5) : horas; // Sat: 8-12
    for (const hora of slots) {
      await run('INSERT OR IGNORE INTO horarios_disponiveis (data,hora,bloqueado) VALUES (?,?,0)',
        [dateStr, hora]);
    }
  }
  console.log('✓ Horários disponíveis criados (próximos 45 dias, seg-sáb)');

  db.close();
  console.log('\n✅ Seed concluído com sucesso!');
  console.log('─────────────────────────────────────────');
  console.log('Acesse: http://localhost:3000');
  console.log('Admin:  http://localhost:3000/admin');
  console.log('Login:  admin / ' + senhaInicial);
  console.log('─────────────────────────────────────────\n');
}

seed().catch(e => { console.error('Erro no seed:', e); process.exit(1); });
