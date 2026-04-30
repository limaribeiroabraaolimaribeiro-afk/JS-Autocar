const router = require('express').Router();
const { supabaseAdmin } = require('../services/supabase');
const { requireAdmin }  = require('../middleware/auth');

// GET /api/gallery  — público (somente itens ativos)
router.get('/', async (req, res) => {
  try {
    let query = supabaseAdmin.from('gallery').select('*').order('created_at', { ascending: false });
    const isAdmin = req.headers.authorization?.startsWith('Bearer ');
    if (!isAdmin) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// POST /api/gallery  — admin
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, description, image_url, category, is_active } = req.body;
    if (!image_url) return res.status(400).json({ error: 'URL da imagem é obrigatória.' });
    const { data, error } = await supabaseAdmin
      .from('gallery')
      .insert({ title, description, image_url, category, is_active: is_active !== false })
      .select().single();
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// PUT /api/gallery/:id  — admin
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { title, description, image_url, category, is_active } = req.body;
    const { error } = await supabaseAdmin
      .from('gallery')
      .update({ title, description, image_url, category, is_active })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// DELETE /api/gallery/:id  — admin
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('gallery').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

module.exports = router;
