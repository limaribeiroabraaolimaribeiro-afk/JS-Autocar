const router   = require('express').Router();
const multer   = require('multer');
const path     = require('path');
const { supabaseAdmin } = require('../services/supabase');
const { requireAdmin }  = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename:    (_, file, cb) => cb(null, `srv-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) =>
    ['image/jpeg','image/png','image/webp'].includes(f.mimetype)
      ? cb(null, true)
      : cb(new Error('Somente JPG, PNG ou WebP'))
});

// GET /api/services  — público: retorna apenas serviços ativos
router.get('/', async (req, res) => {
  try {
    const all = req.query.all === '1';
    let query = supabaseAdmin.from('services').select('*').order('id');
    if (!all) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) {
      console.error('[services] erro ao listar serviços:', error.message, error.code, error.details);
      throw error;
    }
    res.json({ success: true, services: data || [] });
  } catch (e) {
    console.error('[services] erro interno:', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/services  — admin
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, description, price, duration_minutes, image_url, is_active } = req.body;
    if (!name || !duration_minutes) return res.status(400).json({ error: 'Nome e duração são obrigatórios.' });
    const { data, error } = await supabaseAdmin
      .from('services')
      .insert({ name, description, price: price || null, duration_minutes, image_url: image_url || null, is_active: is_active !== false })
      .select().single();
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// PUT /api/services/:id  — admin
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, price, duration_minutes, image_url, is_active } = req.body;
    const { error } = await supabaseAdmin
      .from('services')
      .update({ name, description, price: price || null, duration_minutes, image_url: image_url || null, is_active })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// DELETE /api/services/:id  — admin
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('services').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// POST /api/services/upload  — admin (upload de imagem local)
router.post('/upload', requireAdmin, upload.single('imagem'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

module.exports = router;
