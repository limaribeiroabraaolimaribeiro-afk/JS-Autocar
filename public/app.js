// ─── API BASE URL ─────────────────────────────────────────────────────────────
const API_BASE_URL = '';

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  servicos: [],
  selectedServicos: [],
  calYear: 0, calMonth: 0,
  availableDays: [],
  selectedDate: null,
  availableSlots: [],
  selectedHora: null,
  config: {}
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const api = async (url, opts = {}) => {
  const r = await fetch(`${API_BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Erro desconhecido');
  return data;
};

function showToast(msg, type = 'success', duration = 4000) {
  const ct = $('toastContainer');
  const t  = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✗' : '!'}</span><span>${msg}</span>`;
  ct.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, duration);
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMoney(v) {
  if (!v && v !== 0) return null;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function phoneMask(v) {
  v = v.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 10) return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

function formatPhone(digits) {
  const d = String(digits).replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return digits;
}

function setLoading(btn, loading) {
  if (loading) { btn.classList.add('loading'); btn.disabled = true; }
  else { btn.classList.remove('loading'); btn.disabled = false; }
}

function forceTopOnInitialLoad() {
  if (window.location.hash) return;
  // Bypass smooth-scroll CSS to ensure instant jump on mobile
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = '';
    });
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^(https?:)?\/\//i.test(raw) || /^data:image\//i.test(raw) || /^blob:/i.test(raw)) return raw;
  const cleanPath = raw.replace(/^\.?\//, '');
  return new URL(cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`, window.location.origin).href;
}

function getServiceImageUrl(service) {
  return resolveImageUrl(
    service.image_url ||
    service.image ||
    service.imagem ||
    service.photo ||
    service.foto ||
    service.media_url ||
    service.url
  );
}

function servicePlaceholder(visual, compact = false) {
  return compact
    ? `<div class="svc-grad ${visual.grad}"><span class="svc-icon">${visual.icon}</span></div>`
    : `<div class="svc-grad ${visual.grad}"><span class="svc-icon">${visual.icon}</span><span class="svc-tag">${visual.tag}</span></div>`;
}

function serviceImageHtml(service, visual, compact = false) {
  const imageUrl = getServiceImageUrl(service);
  const placeholder = servicePlaceholder(visual, compact);
  if (!imageUrl) return placeholder;

  // Imagem começa oculta (hidden) para evitar flash do ícone quebrado.
  // onload: mostra a imagem e ativa has-image no pai.
  // onerror: mantém oculta e mostra placeholder.
  return `
    ${placeholder}
    <img src="${escapeHtml(imageUrl)}" alt="" hidden loading="lazy"
         onload="handleServiceImageLoad(this)"
         onerror="handleServiceImageError(this)" />
  `;
}

function handleServiceImageLoad(img) {
  const parent = img && img.parentElement;
  if (parent) parent.classList.add('has-image');
  if (img) img.hidden = false;
}
window.handleServiceImageLoad = handleServiceImageLoad;

function handleServiceImageError(img) {
  const parent = img && img.parentElement;
  if (parent) {
    parent.classList.remove('has-image');
    parent.classList.add('image-error');
  }
  if (img) {
    img.hidden = true;
    img.removeAttribute('src');
  }
}
window.handleServiceImageError = handleServiceImageError;

// ─── PAGES ────────────────────────────────────────────────────────────────────
function showPage(id) {
  ['pageHome','pageServicos','pageCalendario','pageFormulario','pageSuccess']
    .forEach(p => {
      const el = $(p);
      if (el) { el.style.display = p === id ? '' : 'none'; el.classList.toggle('page-hidden', p !== id); }
    });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function voltarHome()      { showPage('pageHome'); }
function voltarServicos()  { showPage('pageServicos'); }
function voltarCalendario(){ showPage('pageCalendario'); }

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  forceTopOnInitialLoad();
  await loadConfig();
  await loadServicos();
  await loadAvaliacoes();
  await loadGaleria();

  const tel = $('fTelefone');
  if (tel) tel.addEventListener('input', e => { e.target.value = phoneMask(e.target.value); });

  const now = new Date();
  state.calYear  = now.getFullYear();
  state.calMonth = now.getMonth();

  // Formulário de contato
  const contactForm = $('contactForm');
  if (contactForm) contactForm.addEventListener('submit', enviarMensagem);

  // Força topo após todo o conteúdo carregar (evita que API responses movam a página no mobile)
  if (!window.location.hash) {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    setTimeout(() => { document.documentElement.style.scrollBehavior = ''; }, 100);
  }
}

async function loadConfig() {
  try {
    const cfg = await api('/api/settings/public');
    state.config = cfg;
    const wa = cfg.whatsapp_numero || '';
    if ($('whatsappText')) $('whatsappText').textContent = wa ? formatPhone(wa) : '(47) 9999-9999';
    if ($('enderecoText')) $('enderecoText').textContent = cfg.endereco || 'Endereço não configurado';
    if ($('footerAddr'))   $('footerAddr').textContent   = cfg.endereco || '-';
    if ($('footerHorario')) $('footerHorario').textContent = cfg.horario_funcionamento || '';
    if ($('footerInstagram') && cfg.instagram) {
      $('footerInstagram').textContent = cfg.instagram;
      $('footerInstagram').href = `https://instagram.com/${cfg.instagram.replace('@','')}`;
    }
    if ($('footerWa')) {
      $('footerWa').href = `https://wa.me/${wa}`;
      $('footerWa').textContent = 'Falar no WhatsApp';
    }
    if ($('headerWhatsapp')) {
      $('headerWhatsapp').onclick = () => wa && window.open(`https://wa.me/${wa}`, '_blank');
      $('headerWhatsapp').style.cursor = wa ? 'pointer' : '';
    }
    // Google Maps embed
    if ($('mapsFrame') && cfg.maps_url) {
      $('mapsFrame').src = cfg.maps_url;
      $('mapsSection') && ($('mapsSection').style.display = '');
    }
    // WhatsApp do site
    const waLinks = document.querySelectorAll('.wa-link');
    waLinks.forEach(el => { if (wa) el.href = `https://wa.me/${wa}`; });

    // Seção de contato
    if ($('enderecoContato')) $('enderecoContato').textContent = cfg.endereco || 'A confirmar';
    if ($('horarioContato'))  $('horarioContato').textContent  = cfg.horario_funcionamento || 'A confirmar';

    // Mascara telefone no formulário de contato
    const ctTel = $('contactTel');
    if (ctTel) ctTel.addEventListener('input', ev => { ev.target.value = phoneMask(ev.target.value); });
  } catch (e) { console.warn('Config não carregada:', e.message); }
}

// ─── SERVICES ─────────────────────────────────────────────────────────────────
async function loadServicos() {
  try {
    const svcResult = await api('/api/services');
    state.servicos = svcResult.services || [];
    renderServicosGrid();
    renderServicosSelect();
  } catch (e) {
    $('servicesGrid').innerHTML = '<p style="color:red;text-align:center">Erro ao carregar serviços.</p>';
  }
}

function serviceVisual(nome) {
  const n = (nome || '').toLowerCase();
  if (n.includes('pesada'))                  return { grad: 'grad-wash',       icon: '🚿', tag: 'Lavagem' };
  if (n.includes('detalh'))                  return { grad: 'grad-detail',     icon: '🔍', tag: 'Detalhamento' };
  if (n.includes('polim') || n.includes('farol')) return { grad: 'grad-headlight', icon: '💡', tag: 'Polimento' };
  if (n.includes('encer'))                   return { grad: 'grad-wax',        icon: '✨', tag: 'Enceramento' };
  if (n.includes('leva') || n.includes('traz')) return { grad: 'grad-delivery', icon: '🚗', tag: 'Leva e Traz' };
  return { grad: 'grad-default', icon: '🔧', tag: 'Serviço' };
}

function renderServicosGrid() {
  const grid = $('servicesGrid');
  if (!state.servicos.length) { grid.innerHTML = '<p style="text-align:center;color:#666">Nenhum serviço disponível.</p>'; return; }
  grid.innerHTML = state.servicos.map(s => {
    const v = serviceVisual(s.name);
    const imgHtml = serviceImageHtml(s, v);
    return `
    <div class="service-card">
      <div class="service-img">${imgHtml}</div>
      <div class="service-body">
        <div class="service-name">${escapeHtml(s.name)}</div>
        <div class="service-desc">${escapeHtml(s.description || '')}</div>
        <div class="service-meta">
          ${s.price ? `<div class="service-price">${formatMoney(s.price)}</div>` : ''}
          <div class="service-duration">⏱ ${formatDuration(s.duration_minutes)}</div>
        </div>
        <button class="btn btn-primary service-btn" onclick="escolherServico(${s.id})">
          Escolher este serviço
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderServicosSelect() {
  const grid = $('servicesSelectGrid');
  if (!state.servicos.length) { grid.innerHTML = '<p style="color:rgba(255,255,255,.5)">Nenhum serviço disponível.</p>'; return; }
  grid.innerHTML = state.servicos.map(s => {
    const v = serviceVisual(s.name);
    const thumbHtml = serviceImageHtml(s, v, true);
    return `
    <div class="service-select-item" id="ssi-${s.id}" onclick="toggleServico(${s.id})">
      <div class="ssi-thumb">${thumbHtml}</div>
      <div class="ssi-right">
        <div class="ssi-check"></div>
        <div class="ssi-content">
          <div class="ssi-name">${escapeHtml(s.name)}</div>
          <div class="ssi-desc">${escapeHtml((s.description || '').slice(0,80))}${(s.description || '').length > 80 ? '…' : ''}</div>
          <div class="ssi-meta">
            ${s.price ? `<div class="ssi-price">${formatMoney(s.price)}</div>` : ''}
            <div class="ssi-dur">⏱ ${formatDuration(s.duration_minutes)}</div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function escolherServico(id) {
  if (!state.selectedServicos.includes(id)) state.selectedServicos.push(id);
  updateSelectedUI();
  showPage('pageServicos');
}

function toggleServico(id) {
  const idx = state.selectedServicos.indexOf(id);
  if (idx >= 0) state.selectedServicos.splice(idx, 1);
  else state.selectedServicos.push(id);
  updateSelectedUI();
}

function updateSelectedUI() {
  state.servicos.forEach(s => {
    const el = $(`ssi-${s.id}`);
    if (el) el.classList.toggle('selected', state.selectedServicos.includes(s.id));
  });
  const sel = state.servicos.filter(s => state.selectedServicos.includes(s.id));
  const summary = $('selectedSummary');
  const btn     = $('btnIrCalendario');
  if (sel.length) {
    summary.style.display = '';
    $('selectedList').innerHTML = sel.map(s => `<span class="selected-tag">${s.name}</span>`).join('');
    const total = sel.reduce((a, s) => a + (parseFloat(s.price) || 0), 0);
    const dur   = sel.reduce((a, s) => a + s.duration_minutes, 0);
    $('selectedTotal').textContent    = total ? formatMoney(total) : 'Consultar';
    $('selectedDuration').textContent = `  ·  ${formatDuration(dur)}`;
    btn.disabled = false;
  } else {
    summary.style.display = 'none';
    btn.disabled = true;
  }
}

function iniciarAgendamento() {
  state.selectedServicos = [];
  updateSelectedUI();
  showPage('pageServicos');
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
async function irParaCalendario() {
  if (!state.selectedServicos.length) { showToast('Selecione ao menos um serviço.', 'warning'); return; }
  showPage('pageCalendario');
  await renderCalendar();
}

async function renderCalendar() {
  const label = $('calMonthLabel');
  const { calYear: year, calMonth: month } = state;
  label.textContent = new Date(year, month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  $('horariosSection').style.display  = 'none';
  $('calendarActions').style.display  = 'none';
  state.selectedDate = null; state.selectedHora = null;
  try {
    state.availableDays = await api(`/api/timeslots/month?year=${year}&month=${month + 1}`);
  } catch { state.availableDays = []; }
  buildCalendarGrid(year, month);
}

function buildCalendarGrid(year, month) {
  const grid    = $('calendarGrid');
  const days    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const today   = new Date(); today.setHours(0,0,0,0);
  const firstDay     = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();

  let html = days.map(d => `<div class="cal-header">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dt      = new Date(year, month, d);
    const isPast  = dt < today;
    const isToday = dt.toDateString() === today.toDateString();
    const isAvail = state.availableDays.includes(dateStr);
    const isSel   = dateStr === state.selectedDate;

    let cls = 'cal-day';
    if (isPast)  cls += ' past';
    else if (isAvail) cls += ' available';
    else cls += ' unavailable';
    if (isToday) cls += ' today';
    if (isSel)   cls += ' selected';

    const click = isAvail && !isPast ? `onclick="selectDate('${dateStr}')"` : '';
    html += `<div class="${cls}" ${click}>${d}</div>`;
  }
  grid.innerHTML = html;
}

async function selectDate(dateStr) {
  state.selectedDate = dateStr; state.selectedHora = null;
  $('calendarActions').style.display = 'none';
  buildCalendarGrid(state.calYear, state.calMonth);

  const horariosSection = $('horariosSection');
  const horariosGrid    = $('horariosGrid');
  $('horariosTitle').textContent = `Horários disponíveis — ${formatDate(dateStr)}`;
  horariosGrid.innerHTML = '<span style="color:#666">Carregando horários...</span>';
  horariosSection.style.display = '';

  try {
    state.availableSlots = await api(`/api/timeslots?date=${dateStr}`);
    if (!state.availableSlots.length) {
      horariosGrid.innerHTML = '<span style="color:#666">Nenhum horário disponível neste dia.</span>';
      return;
    }
    horariosGrid.innerHTML = state.availableSlots.map(h => {
      const cls   = h.reservado ? 'horario-btn indisponivel' : 'horario-btn disponivel';
      const click = h.reservado ? '' : `onclick="selectHorario('${h.time}')"`;
      const label = h.reservado ? `${h.time} — Indisponível` : h.time;
      return `<button class="${cls}" ${click}>${label}</button>`;
    }).join('');
  } catch {
    horariosGrid.innerHTML = '<span style="color:red">Erro ao carregar horários.</span>';
  }
}

function selectHorario(hora) {
  state.selectedHora = hora;
  document.querySelectorAll('.horario-btn').forEach(b => {
    b.classList.remove('selecionado');
    if (b.textContent.trim() === hora) b.classList.add('selecionado');
  });
  $('calendarActions').style.display = '';
}

$('btnMesAnterior') && ($('btnMesAnterior').onclick = async () => {
  const now = new Date();
  if (state.calYear === now.getFullYear() && state.calMonth === now.getMonth()) return;
  state.calMonth--;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
  await renderCalendar();
});

$('btnMesProximo') && ($('btnMesProximo').onclick = async () => {
  state.calMonth++;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  await renderCalendar();
});

// ─── FORM / CONFIRMAÇÃO ───────────────────────────────────────────────────────
function irParaConfirmacao() {
  if (!state.selectedDate || !state.selectedHora) { showToast('Selecione data e horário.', 'warning'); return; }
  buildResumo();
  showPage('pageFormulario');
}

function buildResumo() {
  const sel   = state.servicos.filter(s => state.selectedServicos.includes(s.id));
  const total = sel.reduce((a, s) => a + (parseFloat(s.price) || 0), 0);
  const dur   = sel.reduce((a, s) => a + s.duration_minutes, 0);
  $('formResumo').innerHTML = `
    <h3>Resumo do agendamento</h3>
    <div class="resumo-row"><span class="resumo-label">Serviço(s)</span><span class="resumo-val">${sel.map(s=>s.name).join(', ')}</span></div>
    <div class="resumo-row"><span class="resumo-label">Data</span><span class="resumo-val">${formatDate(state.selectedDate)}</span></div>
    <div class="resumo-row"><span class="resumo-label">Horário</span><span class="resumo-val">${state.selectedHora}</span></div>
    <div class="resumo-row"><span class="resumo-label">Duração estimada</span><span class="resumo-val">${formatDuration(dur)}</span></div>
    <div class="resumo-row"><span class="resumo-label">Valor total</span><span class="resumo-val">${total ? formatMoney(total) : 'A consultar'}</span></div>
  `;
}

async function confirmarAgendamento(e) {
  e.preventDefault();
  const btn = $('btnConfirmar');
  setLoading(btn, true);

  const nome     = $('fNome').value.trim();
  const telefone = $('fTelefone').value.replace(/\D/g,'');
  const carro    = $('fCarro').value.trim();
  const placa    = $('fPlaca').value.trim();
  const obs      = $('fObs').value.trim();

  if (telefone.length < 10) {
    showToast('Informe um telefone válido.', 'error');
    setLoading(btn, false);
    return;
  }

  try {
    const result = await api('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        customer_name:  nome,
        customer_phone: telefone,
        car_model:      carro,
        car_plate:      placa,
        notes:          obs,
        date:           state.selectedDate,
        time:           state.selectedHora,
        service_ids:    state.selectedServicos
      })
    });

    const sel   = state.servicos.filter(s => state.selectedServicos.includes(s.id));
    const total = sel.reduce((a, s) => a + (parseFloat(s.price) || 0), 0);
    const dur   = sel.reduce((a, s) => a + s.duration_minutes, 0);

    const msg = encodeURIComponent(
      `Olá! Acabei de agendar um serviço na JS AutoCar:\n\n` +
      `👤 Nome: ${nome}\n` +
      `📱 Telefone: ${formatPhone(telefone)}\n` +
      `🚗 Carro: ${carro}${placa ? ' - ' + placa : ''}\n` +
      `🔧 Serviço(s): ${sel.map(s=>s.name).join(', ')}\n` +
      `📅 Data: ${formatDate(state.selectedDate)} às ${state.selectedHora}\n` +
      `⏱ Duração estimada: ${formatDuration(dur)}\n` +
      `💰 Valor: ${total ? formatMoney(total) : 'A consultar'}\n` +
      `${obs ? `📝 Obs: ${obs}` : ''}\n\n` +
      `ID do agendamento: #${result.appointment_id}`
    );

    const waNum = state.config.whatsapp_numero || '5547999999999';
    const waUrl = `https://wa.me/${waNum}?text=${msg}`;
    $('linkWhatsapp').href = waUrl;

    showPage('pageSuccess');
    setTimeout(() => window.open(waUrl, '_blank'), 800);
  } catch (err) {
    showToast(err.message || 'Erro ao criar agendamento.', 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ─── AVALIAÇÕES ────────────────────────────────────────────────────────────────
async function loadAvaliacoes() {
  // Mantido para compatibilidade com avaliar.html
  try {
    const avs  = await api('/api/timeslots/month?year=2099&month=01').catch(() => []);
    const grid = $('reviewsGrid');
    if (!grid) return;
    // Avaliações ficam em localStorage por enquanto (exibição apenas)
    const stored = JSON.parse(localStorage.getItem('reviews') || '[]');
    if (!stored.length) {
      grid.innerHTML = '<p style="text-align:center;color:#666">Seja o primeiro a avaliar!</p>';
      return;
    }
    grid.innerHTML = stored.map(a => `
      <div class="review-card">
        <div class="review-stars">${'★'.repeat(a.nota)}${'☆'.repeat(5-a.nota)}</div>
        <div class="review-text">"${a.comentario || 'Ótimo serviço!'}"</div>
        <div class="review-author">— ${a.nome}</div>
      </div>
    `).join('');
  } catch { if ($('reviewsGrid')) $('reviewsGrid').innerHTML = ''; }
}

// ─── GALERIA ──────────────────────────────────────────────────────────────────
async function loadGaleria() {
  const grid = $('galeriaGrid');
  if (!grid) return;
  try {
    const items = await api('/api/gallery');
    if (!items.length) {
      grid.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,.35);padding:2rem 0">Galeria em breve...</p>';
      return;
    }
    grid.innerHTML = items.map(g => `
      <div class="gallery-item">
        <img src="${g.image_url}" alt="${g.title || 'Galeria JS AutoCar'}" loading="lazy" />
        ${g.title ? `<div class="gallery-caption">${g.title}</div>` : ''}
      </div>
    `).join('');
  } catch {
    grid.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,.35);padding:2rem 0">Galeria em breve...</p>';
  }
}

// ─── CONTATO ──────────────────────────────────────────────────────────────────
async function enviarMensagem(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  setLoading(btn, true);

  try {
    await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        customer_name:  $('contactNome').value.trim(),
        customer_phone: $('contactTel').value.replace(/\D/g,''),
        content:        $('contactMsg').value.trim()
      })
    });
    showToast('Mensagem enviada! Entraremos em contato em breve.', 'success', 5000);
    e.target.reset();
  } catch (err) {
    showToast(err.message || 'Erro ao enviar mensagem.', 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ─── START ─────────────────────────────────────────────────────────────────────
window.addEventListener('pageshow', forceTopOnInitialLoad);
document.addEventListener('DOMContentLoaded', init);
