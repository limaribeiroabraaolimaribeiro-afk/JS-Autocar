require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// Garante que pasta de uploads existe
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads', { recursive: true });

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

// ─── STATIC ───────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin',   express.static(path.join(__dirname, 'admin')));

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/admin',        require('./routes/admin'));
app.use('/api/services',     require('./routes/services'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/customers',    require('./routes/customers'));
app.use('/api/messages',     require('./routes/messages'));
app.use('/api/gallery',      require('./routes/gallery'));
app.use('/api/settings',     require('./routes/settings'));
app.use('/api/timeslots',    require('./routes/timeslots'));

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
  console.log(`\nJS AutoCar rodando em http://localhost:${PORT}`);
  console.log(`Painel admin: http://localhost:${PORT}/admin\n`);
});
