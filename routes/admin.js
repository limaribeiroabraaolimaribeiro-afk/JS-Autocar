const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const { requireAdmin } = require('../middleware/auth');

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const adminEmail    = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error('ADMIN_EMAIL ou ADMIN_PASSWORD não definidos no .env');
    return res.status(500).json({ error: 'Configuração do servidor incompleta.' });
  }

  if (email !== adminEmail || password !== adminPassword) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const token = jwt.sign(
    { sub: 'admin', email: adminEmail },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ success: true, token });
});

// GET /api/admin/me
router.get('/me', requireAdmin, (req, res) => {
  res.json({ email: req.admin.email });
});

module.exports = router;
