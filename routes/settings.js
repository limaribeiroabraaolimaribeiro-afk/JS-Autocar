const router = require('express').Router();
const { supabaseAdmin } = require('../services/supabase');
const { requireAdmin }  = require('../middleware/auth');

const PUBLIC_KEYS = ['whatsapp_numero','endereco','horario_funcionamento','instagram','texto_chamada','maps_url'];

// GET /api/settings/public  — público
router.get('/public', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', PUBLIC_KEYS);
    if (error) throw error;
    const obj = {};
    (data || []).forEach(r => { obj[r.key] = r.value; });
    res.json(obj);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// GET /api/settings  — admin
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('settings').select('key, value');
    if (error) throw error;
    const obj = {};
    (data || []).forEach(r => { obj[r.key] = r.value; });
    res.json(obj);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// PUT /api/settings/:key  — admin
router.put('/:key', requireAdmin, async (req, res) => {
  try {
    const { value } = req.body;
    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({ key: req.params.key, value }, { onConflict: 'key' });
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

module.exports = router;
