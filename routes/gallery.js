const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { supabaseAdmin } = require('../services/supabase');
const { requireAdmin }  = require('../middleware/auth');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) =>
    ['image/jpeg','image/png','image/webp'].includes(f.mimetype)
      ? cb(null, true)
      : cb(new Error('Somente JPG, PNG ou WebP'))
});

async function uploadGalleryImage(file) {
  const bucket = process.env.SUPABASE_GALLERY_IMAGES_BUCKET || 'gallery-images';
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const filename = `gal-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const objectPath = `gallery/${filename}`;

  await supabaseAdmin.storage.updateBucket(bucket, { public: true }).catch(() => {});

  let uploaded = await supabaseAdmin.storage
    .from(bucket)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '31536000',
      upsert: false
    });

  if (uploaded.error && /bucket/i.test(uploaded.error.message || '')) {
    const created = await supabaseAdmin.storage.createBucket(bucket, { public: true });
    if (created.error && !/already exists/i.test(created.error.message || '')) throw created.error;
    uploaded = await supabaseAdmin.storage
      .from(bucket)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '31536000',
        upsert: false
      });
  }

  if (uploaded.error) throw uploaded.error;
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

function saveGalleryImageLocally(file) {
  if (!fs.existsSync('uploads')) fs.mkdirSync('uploads', { recursive: true });
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const filename = `gal-${Date.now()}${ext}`;
  fs.writeFileSync(path.join('uploads', filename), file.buffer);
  return `/uploads/${filename}`;
}

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

// POST /api/gallery/upload — admin
router.post('/upload', requireAdmin, upload.single('imagem'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  try {
    const publicUrl = await uploadGalleryImage(req.file);
    res.json({ path: publicUrl });
  } catch (e) {
    console.error('[gallery] upload no Supabase Storage falhou, usando uploads local:', e.message);
    res.json({ path: saveGalleryImageLocally(req.file) });
  }
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
