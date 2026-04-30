const router     = require('express').Router();
const rateLimit  = require('express-rate-limit');
const { supabaseAdmin } = require('../services/supabase');
const { requireAdmin }  = require('../middleware/auth');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' }
});

// GET /api/appointments  — admin
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { filtro } = req.query;
    const hoje = new Date().toISOString().split('T')[0];
    const em7  = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    let query = supabaseAdmin
      .from('appointments')
      .select('*')
      .order('scheduled_date', { ascending: false })
      .order('scheduled_time', { ascending: false });

    if (filtro === 'hoje')      query = query.eq('scheduled_date', hoje);
    if (filtro === 'proximos7') query = query.gte('scheduled_date', hoje).lte('scheduled_date', em7);
    if (filtro === 'novo')      query = query.eq('status', 'novo');
    if (filtro === 'confirmado') query = query.eq('status', 'confirmado');
    if (filtro === 'concluido') query = query.eq('status', 'concluido');
    if (filtro === 'cancelado') query = query.eq('status', 'cancelado');
    if (filtro === 'em_andamento') query = query.eq('status', 'em_andamento');

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// GET /api/appointments/unseen  — admin
router.get('/unseen', requireAdmin, async (req, res) => {
  try {
    const { count, error } = await supabaseAdmin
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('seen_by_admin', false);
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// POST /api/appointments/mark-seen  — admin
router.post('/mark-seen', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('appointments')
      .update({ seen_by_admin: true })
      .eq('seen_by_admin', false);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// GET /api/appointments/:id  — admin
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('appointments').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Não encontrado' });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// POST /api/appointments  — público (criação pelo cliente)
router.post('/', limiter, async (req, res) => {
  const { customer_name, customer_phone, car_model, car_plate, notes, date, time, service_ids } = req.body;

  if (!customer_name || !customer_phone || !car_model || !date || !time || !service_ids?.length) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }

  const tel = String(customer_phone).replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 11) {
    return res.status(400).json({ error: 'Telefone inválido.' });
  }

  try {
    // Busca serviços
    const { data: servicos, error: svcErr } = await supabaseAdmin
      .from('services')
      .select('*')
      .in('id', service_ids)
      .eq('is_active', true);
    if (svcErr) throw svcErr;
    if (servicos.length !== service_ids.length) {
      return res.status(400).json({ error: 'Um ou mais serviços inválidos.' });
    }

    // Verifica se horário está disponível
    const { data: slot } = await supabaseAdmin
      .from('time_slots')
      .select('id')
      .eq('date', date).eq('time', time).eq('blocked', false)
      .single();
    if (!slot) {
      return res.status(400).json({ error: 'Horário não disponível.' });
    }

    // Verifica conflito com agendamento existente
    const { data: conflito } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('scheduled_date', date)
      .eq('scheduled_time', time)
      .neq('status', 'cancelado')
      .maybeSingle();
    if (conflito) {
      return res.status(409).json({ error: 'Horário acabou de ser reservado. Escolha outro.' });
    }

    const total_price      = servicos.reduce((s, x) => s + (parseFloat(x.price) || 0), 0);
    const duration_minutes = servicos.reduce((s, x) => s + x.duration_minutes, 0);

    const { data: appt, error: apptErr } = await supabaseAdmin
      .from('appointments')
      .insert({
        customer: { name: customer_name, phone: tel },
        vehicle:  { model: car_model, plate: car_plate || null },
        service:  {
          ids: service_ids,
          names: servicos.map(s => s.name),
          total_price: total_price || null,
          duration_minutes
        },
        scheduled_date: date,
        scheduled_time: time,
        notes: notes || null,
        status: 'novo',
        seen_by_admin: false
      })
      .select().single();
    if (apptErr) throw apptErr;

    // Upsert do cliente
    await supabaseAdmin.from('customers').upsert(
      { name: customer_name, phone: tel, vehicle_model: car_model, vehicle_plate: car_plate || null },
      { onConflict: 'phone', ignoreDuplicates: false }
    );

    res.json({ success: true, appointment_id: appt.id, total_price, duration_minutes });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao criar agendamento.' });
  }
});

// PATCH /api/appointments/:id/status  — admin
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const valid = ['novo','confirmado','em_andamento','concluido','cancelado'];
    const { status, seen_by_admin } = req.body;

    const updates = {};
    if (status !== undefined) {
      if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
      updates.status = status;
    }
    if (seen_by_admin !== undefined) updates.seen_by_admin = seen_by_admin;

    const { error } = await supabaseAdmin
      .from('appointments').update(updates).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// DELETE /api/appointments/:id  — admin
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('appointments').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

module.exports = router;
