// ─── API BASE URL ─────────────────────────────────────────────────────────────
const API_BASE_URL = '';

// ─── STATE ────────────────────────────────────────────────────────────────────
const S = {
  currentTab: 'agendamentos',
  agendFilter: '',
  msgFilter: 'todas',
  agendamentos: [],
  servicos: [],
  clientes: [],
  mensagens: [],
  galeria: [],
  adminCalYear: 0, adminCalMonth: 0,
  adminCalDaysWithSlots: [],
  adminSelectedDate: null,
  adminHorarios: [],
  editingServicoId: null,
  editingGaleriaId: null,
  pollingInterval: null
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const api = async (url, opts = {}) => {
  const token = localStorage.getItem('admin_token');
  const r = await fetch(`${API_BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    ...opts
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/admin';
      return;
    }
    throw new Error(data.error || 'Erro desconhecido');
  }
  return data;
};

// Upload de arquivo (sem Content-Type para multipart)
const apiUpload = async (url, formData) => {
  const token = localStorage.getItem('admin_token');
  const r = await fetch(`${API_BASE_URL}${url}`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erro no upload');
  return data;
};

function showToast(msg, type = 'success', dur = 4000) {
  const ct = $('toastContainer');
  const t  = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✗' : '!'}</span><span>${msg}</span>`;
  ct.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, dur);
}

function formatMoney(v) {
  if (!v && v !== 0) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDate(d) {
  if (!d) return '-';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatDur(min) {
  if (!min) return '-';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}min` : (h ? `${h}h` : `${min}min`);
}

function fmtTel(t) {
  if (!t) return '-';
  t = String(t).replace(/\D/g,'');
  if (t.length === 11) return `(${t.slice(0,2)}) ${t.slice(2,7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0,2)}) ${t.slice(2,6)}-${t.slice(6)}`;
  return t;
}

function openModal(id)  { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function showConfirm({ title = 'Confirmação', msg = '', sub = '', icon = '⚠️', okLabel = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    $('confirmTitle').textContent    = title;
    $('confirmMsg').textContent      = msg;
    $('confirmIconWrap').textContent = icon;
    const subEl = $('confirmSub');
    subEl.textContent = sub;
    subEl.style.display = sub ? '' : 'none';
    const okBtn = $('confirmOkBtn');
    okBtn.textContent = okLabel;
    okBtn.className   = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    const done = val => { closeModal('confirmModal'); resolve(val); };
    okBtn.onclick = () => done(true);
    $('confirmCancelBtn').onclick = () => done(false);
    openModal('confirmModal');
  });
}

function statusBadge(s) {
  const labels = { novo:'Novo', confirmado:'Confirmado', em_andamento:'Em andamento', concluido:'Concluído', cancelado:'Cancelado', lido:'Lido', respondido:'Respondido' };
  return `<span class="badge badge-${s}">${labels[s] || s}</span>`;
}

function updateClock() {
  $('topbarTime').textContent = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  if (!localStorage.getItem('admin_token')) { window.location.href = '/admin'; return; }
  try {
    const me = await api('/api/admin/me');
    if ($('sidebarUser')) $('sidebarUser').textContent = me.email || 'admin';
  } catch { window.location.href = '/admin'; return; }

  const now = new Date();
  S.adminCalYear  = now.getFullYear();
  S.adminCalMonth = now.getMonth();

  setInterval(updateClock, 1000);
  updateClock();
  showTab('agendamentos');
  startPolling();
}

function startPolling() {
  checkNovos();
  S.pollingInterval = setInterval(checkNovos, 30000);
}

async function checkNovos() {
  try {
    const { count } = await api('/api/appointments/unseen');
    const badge = $('badgeAgendamentos');
    badge.textContent   = count;
    badge.style.display = count > 0 ? '' : 'none';
    const bnBadge = $('bnBadgeAgendamentos');
    if (bnBadge) { bnBadge.textContent = count; bnBadge.style.display = count > 0 ? '' : 'none'; }
  } catch (_) {}
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function showTab(tab) {
  const tabs = ['agendamentos','horarios','servicos','clientes','mensagens','galeria','configuracoes'];
  tabs.forEach(t => {
    $(`tab-${t}`).style.display = t === tab ? '' : 'none';
    const ni = document.querySelector(`.nav-item[data-tab="${t}"]`);
    if (ni) ni.classList.toggle('active', t === tab);
    const bi = document.querySelector(`.bottom-nav-item[data-tab="${t}"]`);
    if (bi) bi.classList.toggle('active', t === tab);
  });
  S.currentTab = tab;

  const titles = {
    agendamentos:'Agendamentos', horarios:'Gerenciar Horários', servicos:'Serviços',
    clientes:'Clientes', mensagens:'Mensagens', galeria:'Galeria', configuracoes:'Configurações'
  };
  $('topbarTitle').textContent = titles[tab] || '';

  if (tab === 'agendamentos') { loadAgendamentos(); loadStats(); markVisto(); }
  if (tab === 'horarios')     loadAdminCalendar();
  if (tab === 'servicos')     loadServicos();
  if (tab === 'clientes')     loadClientes();
  if (tab === 'mensagens')    loadMensagens();
  if (tab === 'galeria')      loadGaleria();
  if (tab === 'configuracoes') loadConfigs();

  closeSidebar();
}

function toggleSidebar() {
  $('sidebar').classList.toggle('open');
  const bd = $('sidebarBackdrop');
  if (bd) bd.classList.toggle('visible', $('sidebar').classList.contains('open'));
}
function closeSidebar() {
  if (window.innerWidth <= 900) {
    $('sidebar').classList.remove('open');
    const bd = $('sidebarBackdrop');
    if (bd) bd.classList.remove('visible');
  }
}

async function markVisto() {
  try { await api('/api/appointments/mark-seen', { method: 'POST' }); $('badgeAgendamentos').style.display = 'none'; } catch (_) {}
}

function doLogout() {
  localStorage.removeItem('admin_token');
  window.location.href = '/admin';
}

// ─── AGENDAMENTOS ─────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const [todos, hoje, novos, confirmados] = await Promise.all([
      api('/api/appointments'),
      api('/api/appointments?filtro=hoje'),
      api('/api/appointments?filtro=novo'),
      api('/api/appointments?filtro=confirmado')
    ]);
    $('statTotal').textContent      = todos.length;
    $('statHoje').textContent       = hoje.length;
    $('statNovos').textContent      = novos.length;
    $('statConfirmados').textContent = confirmados.length;
  } catch (_) {}
}

function setFilter(f) {
  S.agendFilter = f;
  document.querySelectorAll('.filter-tab[data-filter]').forEach(t =>
    t.classList.toggle('active', t.dataset.filter === f));
  loadAgendamentos();
}

async function loadAgendamentos() {
  const tbody = $('agendamentosBody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#6b7280;padding:2rem">Carregando...</td></tr>`;
  try {
    const url = S.agendFilter ? `/api/appointments?filtro=${S.agendFilter}` : '/api/appointments';
    S.agendamentos = await api(url);
    renderAgendamentosTable();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#f87171;padding:2rem">Erro: ${e.message}</td></tr>`;
  }
}

function renderAgendamentosTable() {
  const tbody = $('agendamentosBody');
  if (!S.agendamentos.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Nenhum agendamento encontrado.</td></tr>`;
    return;
  }
  tbody.innerHTML = S.agendamentos.map(a => {
    const customer = a.customer || {};
    const vehicle  = a.vehicle  || {};
    const service  = a.service  || {};
    const tel      = customer.phone || '';
    const telLink  = tel ? `<a href="https://wa.me/55${tel}" target="_blank" style="color:#34d399">${fmtTel(tel)}</a>` : '-';
    const nomes    = Array.isArray(service.names) ? service.names.join(', ') : '-';
    return `
      <tr>
        <td data-label="#">#${a.id}</td>
        <td data-label="Data/Hora">${formatDate(a.scheduled_date)}<br><small style="color:#6b7280">${(a.scheduled_time||'').slice(0,5)}</small></td>
        <td data-label="Cliente"><div style="font-weight:600">${customer.name || '-'}</div><div style="font-size:.75rem">${telLink}</div></td>
        <td data-label="Veículo">${vehicle.model || '-'}${vehicle.plate ? `<br><small style="color:#6b7280">${vehicle.plate}</small>` : ''}</td>
        <td data-label="Serviço" style="max-width:160px;white-space:normal;font-size:.8rem">${nomes}</td>
        <td data-label="Valor">${service.total_price ? formatMoney(service.total_price) : '-'}</td>
        <td data-label="Status">${statusBadge(a.status)}</td>
        <td data-label="Ações">
          <div class="action-btns">
            ${a.status === 'novo'         ? `<button class="btn-act btn-confirm" onclick="updateStatus(${a.id},'confirmado')">Confirmar</button>` : ''}
            ${a.status === 'confirmado'   ? `<button class="btn-act btn-done" onclick="updateStatus(${a.id},'em_andamento')">Iniciar</button>` : ''}
            ${a.status === 'em_andamento' ? `<button class="btn-act btn-done" onclick="updateStatus(${a.id},'concluido')">Concluído</button>` : ''}
            ${['novo','confirmado','em_andamento'].includes(a.status) ? `<button class="btn-act btn-cancel" onclick="updateStatus(${a.id},'cancelado')">Cancelar</button>` : ''}
            <button class="btn-act btn-details" onclick="verDetalhes(${a.id})">Detalhes</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function updateStatus(id, status) {
  try {
    await api(`/api/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast(`Status atualizado para "${status}".`);
    loadAgendamentos(); loadStats();
  } catch (e) { showToast(e.message, 'error'); }
}

async function verDetalhes(id) {
  try {
    const a   = await api(`/api/appointments/${id}`);
    const c   = a.customer || {};
    const v   = a.vehicle  || {};
    const svc = a.service  || {};
    $('detalheBody').innerHTML = `
      <div class="detail-row"><span class="dl">ID</span><span class="dv">#${a.id}</span></div>
      <div class="detail-row"><span class="dl">Cliente</span><span class="dv">${c.name || '-'}</span></div>
      <div class="detail-row"><span class="dl">Telefone</span><span class="dv"><a href="https://wa.me/55${c.phone}" target="_blank" style="color:#34d399">${fmtTel(c.phone)}</a></span></div>
      <div class="detail-row"><span class="dl">Veículo</span><span class="dv">${v.model || '-'}${v.plate ? ' — ' + v.plate : ''}</span></div>
      <div class="detail-row"><span class="dl">Data</span><span class="dv">${formatDate(a.scheduled_date)} às ${(a.scheduled_time||'').slice(0,5)}</span></div>
      <div class="detail-row"><span class="dl">Duração</span><span class="dv">${formatDur(svc.duration_minutes)}</span></div>
      <div class="detail-row"><span class="dl">Valor</span><span class="dv">${svc.total_price ? formatMoney(svc.total_price) : '-'}</span></div>
      <div class="detail-row"><span class="dl">Status</span><span class="dv">${statusBadge(a.status)}</span></div>
      ${svc.names?.length ? `<div class="detail-row"><span class="dl">Serviços</span><span class="dv">${svc.names.join('<br>')}</span></div>` : ''}
      ${a.notes ? `<div class="detail-row"><span class="dl">Obs.</span><span class="dv">${a.notes}</span></div>` : ''}
      <div class="detail-row"><span class="dl">Criado em</span><span class="dv">${new Date(a.created_at).toLocaleString('pt-BR')}</span></div>
    `;
    openModal('detalheModal');
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── HORÁRIOS ─────────────────────────────────────────────────────────────────
async function loadAdminCalendar() {
  const label = $('adminCalMonth');
  const { adminCalYear: y, adminCalMonth: m } = S;
  label.textContent = new Date(y, m).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  try {
    const pad  = String(m + 1).padStart(2, '0');
    const rows = await api('/api/timeslots/admin');
    S.adminCalDaysWithSlots = [...new Set(
      rows.filter(h => h.date.startsWith(`${y}-${pad}`)).map(h => h.date)
    )];
  } catch { S.adminCalDaysWithSlots = []; }
  buildAdminCalGrid(y, m);
}

function buildAdminCalGrid(y, m) {
  const grid = $('adminCalGrid');
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const firstDay    = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  let html = days.map(d => `<div class="admin-cal-header">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="admin-cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dt  = new Date(y, m, d);
    const isPast  = dt < today;
    const hasSl   = S.adminCalDaysWithSlots.includes(ds);
    const isSel   = ds === S.adminSelectedDate;
    let cls = 'admin-cal-day';
    if (isPast) cls += ' past'; else if (hasSl) cls += ' has-slots';
    if (isSel) cls += ' selected';
    const click = !isPast ? `onclick="selectAdminDate('${ds}')"` : '';
    html += `<div class="${cls}" ${click}>${d}</div>`;
  }
  grid.innerHTML = html;
}

async function selectAdminDate(ds) {
  S.adminSelectedDate = ds;
  buildAdminCalGrid(S.adminCalYear, S.adminCalMonth);
  await loadHorariosDay(ds);
  $('horariosDayCard').style.display  = '';
  $('horariosDayTitle').textContent   = `Horários — ${new Date(...ds.split('-').map((v,i)=>i===1?v-1:+v)).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}`;
}

async function loadHorariosDay(ds) {
  try {
    S.adminHorarios = await api(`/api/timeslots/admin?date=${ds}`);
    renderHorariosAdminGrid();
  } catch (e) { showToast(e.message, 'error'); }
}

function renderHorariosAdminGrid() {
  const grid = $('horariosAdminGrid');
  if (!S.adminHorarios.length) { grid.innerHTML = '<span style="color:#6b7280;font-size:.85rem">Nenhum horário cadastrado neste dia.</span>'; return; }
  grid.innerHTML = S.adminHorarios.map(h => {
    const cls = h.reservado ? 'ha-slot reservado' : 'ha-slot';
    const info = h.reservado ? `${h.time} 🔒 ${h.cliente_nome || ''}` : h.time;
    const del  = !h.reservado ? `<button class="del-btn" title="Remover" onclick="removerHorario('${h.date}','${h.time}')">×</button>` : '';
    return `<div class="${cls}">${info}${del}</div>`;
  }).join('');
}

async function adicionarHorario() {
  const hora = $('novoHora').value;
  if (!hora || !S.adminSelectedDate) { showToast('Selecione uma data e hora.', 'warning'); return; }
  try {
    await api('/api/timeslots', { method: 'POST', body: JSON.stringify({ date: S.adminSelectedDate, time: hora }) });
    showToast('Horário adicionado!');
    await loadHorariosDay(S.adminSelectedDate); await loadAdminCalendar();
  } catch (e) { showToast(e.message, 'error'); }
}

async function removerHorario(date, time) {
  const ok = await showConfirm({ title:'Remover horário', msg:`Remover ${time} do dia ${formatDate(date)}?`, okLabel:'Remover', danger:true });
  if (!ok) return;
  try {
    await api('/api/timeslots', { method: 'DELETE', body: JSON.stringify({ date, time }) });
    showToast('Horário removido.');
    await loadHorariosDay(date); await loadAdminCalendar();
  } catch (e) { showToast(e.message, 'error'); }
}

async function criarGradeEmLote() {
  const horasRaw = $('bulkHoras').value.trim();
  const dias     = parseInt($('bulkDias').value) || 30;
  if (!horasRaw) { showToast('Informe os horários.', 'warning'); return; }
  const times = horasRaw.split('\n').map(h => h.trim()).filter(h => /^\d{2}:\d{2}$/.test(h));
  if (!times.length) { showToast('Informe horários no formato HH:MM.', 'error'); return; }

  const dates = [];
  const today = new Date();
  for (let i = 1; dates.length < dias && i <= dias + 60; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    if (d.getDay() !== 0) dates.push(d.toISOString().split('T')[0]);
  }

  try {
    const r = await api('/api/timeslots/bulk', { method: 'POST', body: JSON.stringify({ dates, times }) });
    showToast(`${r.total} horários criados!`);
    await loadAdminCalendar();
    if (S.adminSelectedDate) await loadHorariosDay(S.adminSelectedDate);
  } catch (e) { showToast(e.message, 'error'); }
}

$('adminCalPrev').onclick = async () => {
  const now = new Date();
  if (S.adminCalYear === now.getFullYear() && S.adminCalMonth === now.getMonth()) return;
  S.adminCalMonth--;
  if (S.adminCalMonth < 0) { S.adminCalMonth = 11; S.adminCalYear--; }
  await loadAdminCalendar();
};
$('adminCalNext').onclick = async () => {
  S.adminCalMonth++;
  if (S.adminCalMonth > 11) { S.adminCalMonth = 0; S.adminCalYear++; }
  await loadAdminCalendar();
};

// ─── SERVIÇOS ─────────────────────────────────────────────────────────────────
function svcVisualAdmin(nome) {
  const n = (nome || '').toLowerCase();
  if (n.includes('pesada'))  return { grad: 'grad-wash',       icon: '🚿' };
  if (n.includes('detalh'))  return { grad: 'grad-detail',     icon: '🔍' };
  if (n.includes('polim') || n.includes('farol')) return { grad: 'grad-headlight', icon: '💡' };
  if (n.includes('encer'))   return { grad: 'grad-wax',        icon: '✨' };
  if (n.includes('leva') || n.includes('traz')) return { grad: 'grad-delivery', icon: '🚗' };
  return { grad: 'grad-default', icon: '🔧' };
}

async function loadServicos() {
  const tbody = $('servicosBody');
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:2rem">Carregando...</td></tr>`;
  try {
    const svcResult = await api('/api/services?all=1');
    S.servicos = svcResult.services || [];
    if (!S.servicos.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🔧</div><p>Nenhum serviço cadastrado.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = S.servicos.map(s => {
      const v     = svcVisualAdmin(s.name);
      const thumb = s.image_url
        ? `<img src="${s.image_url}" width="48" height="48" style="border-radius:8px;object-fit:cover;display:block" />`
        : `<div class="svc-thumb-mini ${v.grad}">${v.icon}</div>`;
      return `
        <tr>
          <td data-label="Serviço">
            <div class="service-img-cell">
              ${thumb}
              <div class="svc-name-block">
                <div class="svc-name">${s.name}</div>
                <div class="svc-desc-short">${(s.description||'').slice(0,50)}${(s.description||'').length>50?'…':''}</div>
              </div>
            </div>
          </td>
          <td data-label="Preço">${s.price ? formatMoney(s.price) : '<span style="color:#6b7280">—</span>'}</td>
          <td data-label="Duração">${formatDur(s.duration_minutes)}</td>
          <td data-label="Status"><span class="badge ${s.is_active ? 'badge-confirmado' : 'badge-cancelado'}">${s.is_active ? 'Ativo' : 'Inativo'}</span></td>
          <td data-label="Ações">
            <div class="action-btns">
              <button class="btn-act btn-edit" onclick="editarServico(${s.id})">✏️ Editar</button>
              <button class="btn-act btn-delete" onclick="desativarServico(${s.id},${s.is_active})">${s.is_active ? '⊘ Desativar' : '✓ Ativar'}</button>
              <button class="btn-act btn-destroy" onclick="excluirServico(${s.id},'${s.name.replace(/'/g,"\\'")}')">🗑️ Excluir</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#f87171;padding:2rem">Erro: ${e.message}</td></tr>`;
  }
}

function openServicoModal(id = null) {
  S.editingServicoId = id;
  $('servicoModalTitle').textContent = id ? 'Editar serviço' : 'Novo serviço';
  $('smSaveBtn').textContent         = id ? 'Salvar alterações' : 'Criar serviço';
  if (id) {
    const s = S.servicos.find(x => x.id === id);
    if (!s) return;
    $('smNome').value   = s.name        || '';
    $('smDesc').value   = s.description || '';
    $('smPreco').value  = s.price       || '';
    $('smDuracao').value = s.duration_minutes || '';
    $('smAtivo').checked = !!s.is_active;
    $('smImgUrl').value  = s.image_url  || '';
    if (s.image_url) { $('smImgPreview').src = s.image_url; $('smImgPreview').style.display = ''; }
    else { $('smImgPreview').style.display = 'none'; }
  } else {
    ['smNome','smDesc','smPreco','smDuracao','smImgUrl'].forEach(id => $(id).value = '');
    $('smAtivo').checked = true;
    $('smImgPreview').style.display = 'none';
  }
  openModal('servicoModal');
}

function editarServico(id) { openServicoModal(id); }
function closeServicoModal() { closeModal('servicoModal'); }

async function previewImagem(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('Imagem deve ter no máximo 5MB.', 'error'); input.value = ''; return; }

  const reader = new FileReader();
  reader.onload = e => { $('smImgPreview').src = e.target.result; $('smImgPreview').style.display = ''; };
  reader.readAsDataURL(file);

  const fd = new FormData(); fd.append('imagem', file);
  try {
    const r = await apiUpload('/api/services/upload', fd);
    $('smImgUrl').value = r.path;
    showToast('Imagem enviada!');
  } catch (e) { showToast('Erro no upload: ' + e.message, 'error'); }
}

async function salvarServico() {
  const name             = $('smNome').value.trim();
  const duration_minutes = parseInt($('smDuracao').value);
  if (!name) { showToast('Nome é obrigatório.', 'error'); return; }
  if (!duration_minutes || duration_minutes < 1) { showToast('Duração inválida.', 'error'); return; }

  const body = {
    name, description: $('smDesc').value.trim() || null,
    price: parseFloat($('smPreco').value) || null,
    duration_minutes, image_url: $('smImgUrl').value.trim() || null,
    is_active: $('smAtivo').checked
  };

  try {
    if (S.editingServicoId) {
      await api(`/api/services/${S.editingServicoId}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Serviço atualizado!');
    } else {
      await api('/api/services', { method: 'POST', body: JSON.stringify(body) });
      showToast('Serviço criado!');
    }
    closeServicoModal(); loadServicos();
  } catch (e) { showToast(e.message, 'error'); }
}

async function desativarServico(id, ativo) {
  const acao = ativo ? 'desativar' : 'ativar';
  const ok   = await showConfirm({ title: ativo ? 'Desativar serviço' : 'Ativar serviço', msg: `Deseja ${acao} este serviço?`, icon: ativo ? '⊘' : '✓', okLabel: ativo ? 'Desativar' : 'Ativar', danger: ativo });
  if (!ok) return;
  const s = S.servicos.find(x => x.id === id);
  try {
    await api(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify({ ...s, is_active: !ativo }) });
    showToast(`Serviço ${ativo ? 'desativado' : 'ativado'}!`); loadServicos();
  } catch (e) { showToast(e.message, 'error'); }
}

async function excluirServico(id, nome) {
  const ok = await showConfirm({ title:'Excluir serviço', msg:`Excluir permanentemente "${nome}"?`, sub:'Esta ação não pode ser desfeita.', icon:'🗑️', okLabel:'Excluir permanentemente', danger:true });
  if (!ok) return;
  try {
    await api(`/api/services/${id}`, { method: 'DELETE' });
    showToast('Serviço excluído.'); loadServicos();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
async function loadClientes() {
  const tbody = $('clientesBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:2rem">Carregando...</td></tr>`;
  try {
    S.clientes = await api('/api/customers');
    if (!S.clientes.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👤</div><p>Nenhum cliente cadastrado.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = S.clientes.map(c => `
      <tr>
        <td data-label="#">#${c.id}</td>
        <td data-label="Nome" style="font-weight:600">${c.name}</td>
        <td data-label="Telefone"><a href="https://wa.me/55${c.phone}" target="_blank" style="color:#34d399">${fmtTel(c.phone)}</a></td>
        <td data-label="Veículo">${c.vehicle_model || '-'}</td>
        <td data-label="Placa">${c.vehicle_plate || '-'}</td>
        <td data-label="Cadastro" style="font-size:.8rem;color:#6b7280">${new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#f87171;padding:2rem">Erro: ${e.message}</td></tr>`;
  }
}

// ─── MENSAGENS ────────────────────────────────────────────────────────────────
async function loadMensagens() {
  const list = $('mensagensAdminList');
  list.innerHTML = '<div style="text-align:center;color:#6b7280;padding:3rem">Carregando...</div>';
  try {
    S.mensagens = await api('/api/messages');
    // Atualiza badge sidebar + bottom nav
    const novas = S.mensagens.filter(m => m.status === 'novo').length;
    const badge = $('badgeMensagens');
    badge.textContent   = novas;
    badge.style.display = novas > 0 ? '' : 'none';
    const bnBadge = $('bnBadgeMensagens');
    if (bnBadge) { bnBadge.textContent = novas; bnBadge.style.display = novas > 0 ? '' : 'none'; }
    renderMensagens();
  } catch (e) { list.innerHTML = `<div style="text-align:center;color:#f87171;padding:2rem">Erro: ${e.message}</div>`; }
}

function setMsgFilter(f) {
  S.msgFilter = f;
  document.querySelectorAll('.filter-tab[data-msgfilt]').forEach(t =>
    t.classList.toggle('active', t.dataset.msgfilt === f));
  renderMensagens();
}

function renderMensagens() {
  const list  = $('mensagensAdminList');
  let items   = S.mensagens;
  if (S.msgFilter !== 'todas') items = items.filter(m => m.status === S.msgFilter);
  if (!items.length) { list.innerHTML = '<div style="text-align:center;color:#6b7280;padding:3rem">Nenhuma mensagem encontrada.</div>'; return; }
  list.innerHTML = items.map(m => `
    <div class="review-admin-card">
      <div>
        <div style="font-weight:700;margin-bottom:.3rem">${m.customer_name} &nbsp;·&nbsp; <a href="https://wa.me/55${m.customer_phone}" target="_blank" style="color:#34d399">${fmtTel(m.customer_phone)}</a></div>
        <div style="font-size:.875rem;color:#d1d5db;margin-bottom:.4rem">${m.content}</div>
        <div style="font-size:.78rem;color:#6b7280">${new Date(m.created_at).toLocaleString('pt-BR')} &nbsp;·&nbsp; ${statusBadge(m.status)}</div>
      </div>
      <div class="rac-actions">
        ${m.status !== 'lido'       ? `<button class="btn-act btn-approve" onclick="updateMsgStatus(${m.id},'lido')">Marcar lida</button>` : ''}
        ${m.status !== 'respondido' ? `<button class="btn-act btn-done" onclick="updateMsgStatus(${m.id},'respondido')">Respondida</button>` : ''}
      </div>
    </div>`).join('');
}

async function updateMsgStatus(id, status) {
  try {
    await api(`/api/messages/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast('Status atualizado!'); loadMensagens();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── GALERIA ──────────────────────────────────────────────────────────────────
async function loadGaleria() {
  const grid = $('galeriaAdminGrid');
  grid.innerHTML = '<div style="text-align:center;color:#6b7280;padding:3rem">Carregando...</div>';
  try {
    S.galeria = await api('/api/gallery');
    if (!S.galeria.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🖼️</div><p>Nenhuma foto na galeria.</p></div>';
      return;
    }
    grid.innerHTML = `<div class="gallery-admin-items">${S.galeria.map(g => `
      <div class="gallery-admin-item">
        <img src="${g.image_url}" alt="${g.title || ''}" />
        <div class="gai-info">
          <div class="gai-title">${g.title || 'Sem título'}</div>
          ${g.category ? `<div class="gai-cat">${g.category}</div>` : ''}
          <span class="badge ${g.is_active ? 'badge-confirmado' : 'badge-cancelado'}">${g.is_active ? 'Ativo' : 'Inativo'}</span>
        </div>
        <div class="gai-actions">
          <button class="btn-act btn-edit" onclick="editarGaleria(${g.id})">✏️</button>
          <button class="btn-act btn-destroy" onclick="excluirGaleria(${g.id})">🗑️</button>
        </div>
      </div>`).join('')}</div>`;
  } catch (e) { grid.innerHTML = `<div style="text-align:center;color:#f87171;padding:2rem">Erro: ${e.message}</div>`; }
}

function openGaleriaModal(id = null) {
  S.editingGaleriaId = id;
  $('galeriaModalTitle').textContent = id ? 'Editar foto' : 'Adicionar foto';
  $('glSaveBtn').textContent         = id ? 'Salvar alterações' : 'Adicionar';
  if (id) {
    const g = S.galeria.find(x => x.id === id);
    if (!g) return;
    $('glImgUrl').value   = g.image_url  || '';
    $('glTitulo').value   = g.title      || '';
    $('glDesc').value     = g.description || '';
    $('glCategoria').value = g.category  || '';
    $('glAtivo').checked   = !!g.is_active;
  } else {
    ['glImgUrl','glTitulo','glDesc','glCategoria'].forEach(id => $(id).value = '');
    $('glAtivo').checked = true;
  }
  openModal('galeriaModal');
}

function editarGaleria(id) { openGaleriaModal(id); }

async function salvarGaleria() {
  const image_url = $('glImgUrl').value.trim();
  if (!image_url) { showToast('URL da imagem é obrigatória.', 'error'); return; }
  const body = { image_url, title: $('glTitulo').value.trim() || null, description: $('glDesc').value.trim() || null, category: $('glCategoria').value.trim() || null, is_active: $('glAtivo').checked };
  try {
    if (S.editingGaleriaId) {
      await api(`/api/gallery/${S.editingGaleriaId}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Foto atualizada!');
    } else {
      await api('/api/gallery', { method: 'POST', body: JSON.stringify(body) });
      showToast('Foto adicionada!');
    }
    closeModal('galeriaModal'); loadGaleria();
  } catch (e) { showToast(e.message, 'error'); }
}

async function excluirGaleria(id) {
  const ok = await showConfirm({ title:'Excluir foto', msg:'Excluir esta foto da galeria?', icon:'🗑️', okLabel:'Excluir', danger:true });
  if (!ok) return;
  try {
    await api(`/api/gallery/${id}`, { method: 'DELETE' });
    showToast('Foto excluída.'); loadGaleria();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── CONFIGURAÇÕES ────────────────────────────────────────────────────────────
async function loadConfigs() {
  try {
    const cfg = await api('/api/settings');
    $('cfgWa').value        = cfg.whatsapp_numero       || '';
    $('cfgEndereco').value  = cfg.endereco              || '';
    $('cfgHorario').value   = cfg.horario_funcionamento || '';
    $('cfgInstagram').value = cfg.instagram             || '';
    $('cfgChamada').value   = cfg.texto_chamada         || '';
    $('cfgMaps').value      = cfg.maps_url              || '';
  } catch (e) { showToast(e.message, 'error'); }
}

async function salvarConfigs() {
  const entries = {
    whatsapp_numero:       $('cfgWa').value.replace(/\D/g,''),
    endereco:              $('cfgEndereco').value.trim(),
    horario_funcionamento: $('cfgHorario').value.trim(),
    instagram:             $('cfgInstagram').value.trim(),
    texto_chamada:         $('cfgChamada').value.trim(),
    maps_url:              $('cfgMaps').value.trim()
  };
  try {
    await Promise.all(
      Object.entries(entries).map(([key, value]) =>
        api(`/api/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) })
      )
    );
    showToast('Configurações salvas!');
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────
document.addEventListener('change', e => {
  if (e.target.id === 'smAtivo') {
    $('smAtivoLabel').textContent = e.target.checked ? 'Ativo (visível no site)' : 'Inativo (oculto no site)';
  }
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
