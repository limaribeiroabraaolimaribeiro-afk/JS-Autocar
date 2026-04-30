const router = require('express').Router();
const { supabaseAdmin } = require('../services/supabase');
const { requireAdmin }  = require('../middleware/auth');

// GET /api/customers  — admin
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

module.exports = router;
