const router   = require('express').Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { supabaseAdmin } = require('../services/supabase');
const { requireAdmin }  = require('../middleware/auth');

function normalizeImagePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^(https?:)?\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : `/${raw.replace(/^\.?\//, '')}`;
}

function normalizeService(service) {
  const imageUrl = normalizeImagePath(
    service.image_url ||
    service.image ||
    service.imagem ||
    service.photo ||
    service.foto ||
    service.media_url ||
    service.url
  );

  return {
    ...service,
    image_url: imageUrl
  };
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) =>
    ['image/jpeg','image/png','image/webp'].includes(f.mimetype)
      ? cb(null, true)
      : cb(new Error('Somente JPG, PNG ou WebP'))
});

async function uploadToSupabaseStorage(file) {
  const bucket = process.env.SUPABASE_SERVICE_IMAGES_BUCKET || 'service-images';
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const filename = `srv-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const objectPath = `services/${filename}`;

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

function saveUploadLocally(file) {
  if (!fs.existsSync('uploads')) fs.mkdirSync('uploads', { recursive: true });
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const filename = `srv-${Date.now()}${ext}`;
  fs.writeFileSync(path.join('uploads', filename), file.buffer);
  return `/uploads/${filename}`;
}

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
    res.json({ success: true, services: (data || []).map(normalizeService) });
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

// POST /api/services/upload  — admin
router.post('/upload', requireAdmin, upload.single('imagem'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  try {
    const publicUrl = await uploadToSupabaseStorage(req.file);
    res.json({ path: publicUrl });
  } catch (e) {
    console.error('[services] upload no Supabase Storage falhou, usando uploads local:', e.message);
    res.json({ path: saveUploadLocally(req.file) });
  }
});

module.exports = router;
