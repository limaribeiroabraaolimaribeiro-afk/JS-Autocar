const router    = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabaseAdmin } = require('../services/supabase');
const { requireAdmin }  = require('../middleware/auth');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Muitas mensagens. Aguarde alguns minutos.' }
});

// GET /api/messages  — admin
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// POST /api/messages  — público (formulário de contato)
router.post('/', limiter, async (req, res) => {
  try {
    const { customer_name, customer_phone, content } = req.body;
    if (!customer_name || !customer_phone || !content) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    }
    const tel = String(customer_phone).replace(/\D/g, '');
    if (tel.length < 10) return res.status(400).json({ error: 'Telefone inválido.' });

    const { error } = await supabaseAdmin
      .from('messages')
      .insert({ customer_name, customer_phone: tel, content, status: 'novo' });
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// PATCH /api/messages/:id/status  — admin
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['novo','lido','respondido'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const { error } = await supabaseAdmin
      .from('messages').update({ status }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

module.exports = router;
