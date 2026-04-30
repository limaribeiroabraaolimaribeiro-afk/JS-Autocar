const router = require('express').Router();
const { supabaseAdmin } = require('../services/supabase');
const { requireAdmin }  = require('../middleware/auth');

// GET /api/timeslots/month?year=&month=  — público
router.get('/month', async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Ano e mês obrigatórios.' });

    const pad  = String(month).padStart(2, '0');
    const ini  = `${year}-${pad}-01`;
    const fim  = `${year}-${pad}-31`;
    const hoje = new Date().toISOString().split('T')[0];

    // Busca todos os slots do mês (não bloqueados, a partir de hoje)
    const { data: slots, error } = await supabaseAdmin
      .from('time_slots')
      .select('date, time, blocked')
      .gte('date', hoje <= ini ? ini : hoje)
      .lte('date', fim)
      .eq('blocked', false);
    if (error) throw error;

    // Busca agendamentos não cancelados no período
    const { data: appts } = await supabaseAdmin
      .from('appointments')
      .select('scheduled_date, scheduled_time')
      .gte('scheduled_date', ini)
      .lte('scheduled_date', fim)
      .neq('status', 'cancelado');

    const reservados = new Set((appts || []).map(a => `${a.scheduled_date}|${a.scheduled_time}`));

    // Datas que têm ao menos um slot livre
    const diasDisponiveis = [...new Set(
      (slots || [])
        .filter(s => !reservados.has(`${s.date}|${s.time}`))
        .map(s => s.date)
    )];

    res.json(diasDisponiveis);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// GET /api/timeslots?date=YYYY-MM-DD  — público
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Data obrigatória.' });

    const hoje     = new Date().toISOString().split('T')[0];
    const agora    = new Date();
    const horaAtual = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;

    const { data: slots, error } = await supabaseAdmin
      .from('time_slots')
      .select('*')
      .eq('date', date)
      .eq('blocked', false)
      .order('time');
    if (error) throw error;

    const { data: appts } = await supabaseAdmin
      .from('appointments')
      .select('scheduled_time')
      .eq('scheduled_date', date)
      .neq('status', 'cancelado');

    const reservados = new Set((appts || []).map(a => a.scheduled_time?.slice(0,5)));

    const filtrados = (slots || []).filter(s => {
      const hora = s.time?.slice(0,5);
      if (date > hoje) return true;
      if (date === hoje) return hora > horaAtual;
      return false;
    }).map(s => ({
      ...s,
      time: s.time?.slice(0,5),
      reservado: reservados.has(s.time?.slice(0,5))
    }));

    res.json(filtrados);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// POST /api/timeslots  — admin
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { date, time, blocked } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'Data e hora obrigatórios.' });
    const { error } = await supabaseAdmin
      .from('time_slots')
      .upsert({ date, time, blocked: !!blocked }, { onConflict: 'date,time' });
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// POST /api/timeslots/bulk  — admin
router.post('/bulk', requireAdmin, async (req, res) => {
  try {
    const { dates, times } = req.body;
    if (!dates?.length || !times?.length) return res.status(400).json({ error: 'Datas e horários obrigatórios.' });
    const rows = [];
    for (const date of dates) {
      for (const time of times) {
        rows.push({ date, time, blocked: false });
      }
    }
    const { error } = await supabaseAdmin
      .from('time_slots')
      .upsert(rows, { onConflict: 'date,time', ignoreDuplicates: true });
    if (error) throw error;
    res.json({ success: true, total: rows.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// DELETE /api/timeslots  — admin
router.delete('/', requireAdmin, async (req, res) => {
  try {
    const { date, time } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'Data e hora obrigatórios.' });
    const { error } = await supabaseAdmin
      .from('time_slots')
      .delete()
      .eq('date', date).eq('time', time);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// GET /api/timeslots/admin  — admin (todos os slots ou por data)
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    let query = supabaseAdmin.from('time_slots').select('*').order('date').order('time');
    if (date) query = query.eq('date', date);
    const { data, error } = await query;
    if (error) throw error;

    if (!date) { res.json(data); return; }

    // Para uma data específica, inclui info de reserva
    const { data: appts } = await supabaseAdmin
      .from('appointments')
      .select('scheduled_time, customer, status, id')
      .eq('scheduled_date', date)
      .neq('status', 'cancelado');

    const reservaMap = {};
    (appts || []).forEach(a => { reservaMap[a.scheduled_time?.slice(0,5)] = a; });

    const result = (data || []).map(s => {
      const hora = s.time?.slice(0,5);
      const appt = reservaMap[hora];
      return { ...s, time: hora, reservado: !!appt, cliente_nome: appt?.customer?.name, agendamento_id: appt?.id, agendamento_status: appt?.status };
    });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

module.exports = router;
