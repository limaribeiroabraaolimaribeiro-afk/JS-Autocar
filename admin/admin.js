// ─── STATE ───────────────────────────────────────────────────────────────────
const S = {
  currentTab: 'agendamentos',
  agendFilter: '',
  ravFilter: 'todas',
  agendamentos: [],
  servicos: [],
  avaliacoes: [],
  adminCalYear: 0,
  adminCalMonth: 0,
  adminCalDaysWithSlots: [],
  adminSelectedDate: null,
  adminHorarios: [],
  editingServicoId: null,
  pollingInterval: null
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const api = async (url, opts = {}) => {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) { window.location.href = '/admin'; return; }
    throw new Error(data.error || 'Erro desconhecido');
  }
  return data;
};

function showToast(msg, type = 'success', dur = 4000) {
  const ct = $('toastContainer');
  const t = document.createElement('div');
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

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function showConfirm({ title = 'Confirmação', msg = '', sub = '', icon = '⚠️', okLabel = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    $('confirmTitle').textContent = title;
    $('confirmMsg').textContent = msg;
    $('confirmIconWrap').textContent = icon;
    const subEl = $('confirmSub');
    subEl.textContent = sub;
    subEl.style.display = sub ? '' : 'none';

    const okBtn = $('confirmOkBtn');
    okBtn.textContent = okLabel;
    okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

    const done = val => { closeModal('confirmModal'); resolve(val); };
    okBtn.onclick = () => done(true);
    $('confirmCancelBtn').onclick = () => done(false);

    openModal('confirmModal');
  });
}

function statusBadge(s) {
  return `<span class="badge badge-${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`;
}

function updateClock() {
  const now = new Date();
  $('topbarTime').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const me = await api('/api/admin/me');
    if ($('sidebarUser')) $('sidebarUser').textContent = me.usuario;
  } catch (_) { window.location.href = '/admin'; return; }

  const now = new Date();
  S.adminCalYear = now.getFullYear();
  S.adminCalMonth = now.getMonth();

  setInterval(updateClock, 1000);
  updateClock();

  showTab('agendamentos');
  startPolling();
}

function startPolling() {
  checkNovosAgendamentos();
  S.pollingInterval = setInterval(checkNovosAgendamentos, 30000);
}

async function checkNovosAgendamentos() {
  try {
    const { count } = await api('/api/admin/agendamentos/nao-vistos');
    const badge = $('badgeAgendamentos');
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  } catch (_) {}
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function showTab(tab) {
  ['agendamentos','horarios','servicos','avaliacoes','configuracoes'].forEach(t => {
    $(`tab-${t}`).style.display = t === tab ? '' : 'none';
    const ni = document.querySelector(`.nav-item[data-tab="${t}"]`);
    if (ni) ni.classList.toggle('active', t === tab);
  });
  S.currentTab = tab;

  const titles = { agendamentos:'Agendamentos', horarios:'Gerenciar Horários', servicos:'Serviços', avaliacoes:'Avaliações', configuracoes:'Configurações' };
  $('topbarTitle').textContent = titles[tab] || '';

  if (tab === 'agendamentos') { loadAgendamentos(); loadStats(); markVisto(); }
  if (tab === 'horarios') { loadAdminCalendar(); }
  if (tab === 'servicos') loadServicos();
  if (tab === 'avaliacoes') loadAvaliacoes();
  if (tab === 'configuracoes') loadConfigs();

  closeSidebar();
}

function toggleSidebar() { $('sidebar').classList.toggle('open'); }
function closeSidebar() { if (window.innerWidth <= 900) $('sidebar').classList.remove('open'); }

async function markVisto() {
  try {
    await api('/api/admin/agendamentos/marcar-visto', { method: 'POST' });
    $('badgeAgendamentos').style.display = 'none';
  } catch (_) {}
}

async function doLogout() {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/admin';
}

// ─── AGENDAMENTOS ──────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const [todos, hoje, pendentes, confirmados] = await Promise.all([
      api('/api/admin/agendamentos'),
      api('/api/admin/agendamentos?filtro=hoje'),
      api('/api/admin/agendamentos?filtro=pendentes'),
      api('/api/admin/agendamentos?filtro=confirmados')
    ]);
    $('statTotal').textContent = todos.length;
    $('statHoje').textContent = hoje.length;
    $('statPendentes').textContent = pendentes.length;
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
    const url = S.agendFilter ? `/api/admin/agendamentos?filtro=${S.agendFilter}` : '/api/admin/agendamentos';
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
    const telLink = `<a href="https://wa.me/55${a.cliente_telefone}" target="_blank" title="Abrir WhatsApp" style="color:#34d399">${fmtTel(a.cliente_telefone)}</a>`;
    return `
      <tr>
        <td>#${a.id}</td>
        <td>${formatDate(a.data)}<br><small style="color:#6b7280">${a.hora}</small></td>
        <td><div style="font-weight:600">${a.cliente_nome}</div><div style="font-size:.75rem">${telLink}</div></td>
        <td>${a.carro_modelo}${a.carro_placa ? `<br><small style="color:#6b7280">${a.carro_placa}</small>` : ''}</td>
        <td style="max-width:160px;white-space:normal;font-size:.8rem">${a.servicos_nomes || '-'}</td>
        <td>${formatMoney(a.valor_total)}</td>
        <td>${statusBadge(a.status)}</td>
        <td>
          <div class="action-btns">
            ${a.status === 'pendente' ? `<button class="btn-act btn-confirm" onclick="updateStatus(${a.id},'confirmado')">Confirmar</button>` : ''}
            ${a.status === 'confirmado' ? `<button class="btn-act btn-done" onclick="updateStatus(${a.id},'concluido')">Concluído</button>` : ''}
            ${['pendente','confirmado'].includes(a.status) ? `<button class="btn-act btn-cancel" onclick="updateStatus(${a.id},'cancelado')">Cancelar</button>` : ''}
            <button class="btn-act btn-details" onclick="verDetalhes(${a.id})">Detalhes</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function fmtTel(t) {
  if (!t) return '-';
  t = String(t).replace(/\D/g,'');
  if (t.length === 11) return `(${t.slice(0,2)}) ${t.slice(2,7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0,2)}) ${t.slice(2,6)}-${t.slice(6)}`;
  return t;
}

async function updateStatus(id, status) {
  try {
    await api(`/api/admin/agendamentos/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast(`Status atualizado para "${status}".`);
    loadAgendamentos();
    loadStats();
  } catch (e) { showToast(e.message, 'error'); }
}

async function verDetalhes(id) {
  try {
    const a = await api(`/api/admin/agendamentos/${id}`);
    $('detalheBody').innerHTML = `
      <div class="detail-row"><span class="dl">ID</span><span class="dv">#${a.id}</span></div>
      <div class="detail-row"><span class="dl">Cliente</span><span class="dv">${a.cliente_nome}</span></div>
      <div class="detail-row"><span class="dl">Telefone</span><span class="dv"><a href="https://wa.me/55${a.cliente_telefone}" target="_blank" style="color:#34d399">${fmtTel(a.cliente_telefone)}</a></span></div>
      <div class="detail-row"><span class="dl">Carro</span><span class="dv">${a.carro_modelo}${a.carro_placa ? ' — '+a.carro_placa : ''}</span></div>
      <div class="detail-row"><span class="dl">Data</span><span class="dv">${formatDate(a.data)} às ${a.hora}</span></div>
      <div class="detail-row"><span class="dl">Duração</span><span class="dv">${formatDur(a.duracao_total)}</span></div>
      <div class="detail-row"><span class="dl">Valor</span><span class="dv">${formatMoney(a.valor_total)}</span></div>
      <div class="detail-row"><span class="dl">Status</span><span class="dv">${statusBadge(a.status)}</span></div>
      ${a.servicos?.length ? `<div class="detail-row"><span class="dl">Serviços</span><span class="dv">${a.servicos.map(s=>s.nome).join('<br>')}</span></div>` : ''}
      ${a.observacoes ? `<div class="detail-row"><span class="dl">Obs.</span><span class="dv">${a.observacoes}</span></div>` : ''}
      <div class="detail-row"><span class="dl">Criado em</span><span class="dv">${new Date(a.criado_em).toLocaleString('pt-BR')}</span></div>
    `;
    openModal('detalheModal');
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── HORÁRIOS ──────────────────────────────────────────────────────────────────
async function loadAdminCalendar() {
  const label = $('adminCalMonth');
  const { adminCalYear: y, adminCalMonth: m } = S;
  label.textContent = new Date(y, m).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  try {
    const pad = String(m + 1).padStart(2, '0');
    const rows = await api(`/api/admin/horarios`);
    const datesInMonth = rows
      .filter(h => h.data.startsWith(`${y}-${pad}`))
      .map(h => h.data);
    S.adminCalDaysWithSlots = [...new Set(datesInMonth)];
  } catch (_) { S.adminCalDaysWithSlots = []; }

  buildAdminCalGrid(y, m);
}

function buildAdminCalGrid(y, m) {
  const grid = $('adminCalGrid');
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  let html = days.map(d => `<div class="admin-cal-header">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="admin-cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dt = new Date(y, m, d);
    const isPast = dt < today;
    const hasSl = S.adminCalDaysWithSlots.includes(ds);
    const isSel = ds === S.adminSelectedDate;
    let cls = 'admin-cal-day';
    if (isPast) cls += ' past';
    else if (hasSl) cls += ' has-slots';
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
  $('horariosDayCard').style.display = '';
  $('horariosDayTitle').textContent = `Horários — ${new Date(...ds.split('-').map((v,i)=>i===1?v-1:+v)).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}`;
}

async function loadHorariosDay(ds) {
  try {
    S.adminHorarios = await api(`/api/admin/horarios?data=${ds}`);
    renderHorariosAdminGrid();
  } catch (e) { showToast(e.message, 'error'); }
}

function renderHorariosAdminGrid() {
  const grid = $('horariosAdminGrid');
  if (!S.adminHorarios.length) { grid.innerHTML = '<span style="color:#6b7280;font-size:.85rem">Nenhum horário cadastrado neste dia.</span>'; return; }
  grid.innerHTML = S.adminHorarios.map(h => {
    const cls = h.reservado ? 'ha-slot reservado' : 'ha-slot';
    const info = h.reservado ? `${h.hora} 🔒 ${h.cliente_nome || ''}` : h.hora;
    const del = !h.reservado ? `<button class="del-btn" title="Remover" onclick="removerHorario('${h.data}','${h.hora}')">×</button>` : '';
    return `<div class="${cls}">${info}${del}</div>`;
  }).join('');
}

async function adicionarHorario() {
  const hora = $('novoHora').value;
  if (!hora || !S.adminSelectedDate) { showToast('Selecione uma data e hora.', 'warning'); return; }
  try {
    await api('/api/admin/horarios', { method: 'POST', body: JSON.stringify({ data: S.adminSelectedDate, hora }) });
    showToast('Horário adicionado!');
    await loadHorariosDay(S.adminSelectedDate);
    await loadAdminCalendar();
  } catch (e) { showToast(e.message, 'error'); }
}

async function removerHorario(data, hora) {
  const ok = await showConfirm({
    title: 'Remover horário',
    msg: `Remover o horário ${hora} do dia ${formatDate(data)}?`,
    okLabel: 'Remover',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/api/admin/horarios', { method: 'DELETE', body: JSON.stringify({ data, hora }) });
    showToast('Horário removido.');
    await loadHorariosDay(data);
    await loadAdminCalendar();
  } catch (e) { showToast(e.message, 'error'); }
}

async function criarGradeEmLote() {
  const horasRaw = $('bulkHoras').value.trim();
  const dias = parseInt($('bulkDias').value) || 30;
  if (!horasRaw) { showToast('Informe os horários.', 'warning'); return; }

  const horas = horasRaw.split('\n').map(h => h.trim()).filter(h => /^\d{2}:\d{2}$/.test(h));
  if (!horas.length) { showToast('Informe horários no formato HH:MM.', 'error'); return; }

  const datas = [];
  const today = new Date();
  for (let i = 1; i <= dias + 30; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    if (d.getDay() !== 0) { // skip Sunday
      datas.push(d.toISOString().split('T')[0]);
    }
    if (datas.length >= dias) break;
  }

  try {
    const r = await api('/api/admin/horarios/bulk', { method: 'POST', body: JSON.stringify({ datas, horas }) });
    showToast(`${r.total} horários criados com sucesso!`);
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

// ─── SERVIÇOS ──────────────────────────────────────────────────────────────────
function svcVisualAdmin(nome) {
  const n = (nome || '').toLowerCase();
  if (n.includes('pesada'))   return { grad: 'grad-wash',      icon: '🚿' };
  if (n.includes('detalh'))   return { grad: 'grad-detail',    icon: '🔍' };
  if (n.includes('polim') || n.includes('farol')) return { grad: 'grad-headlight', icon: '💡' };
  if (n.includes('encer'))    return { grad: 'grad-wax',       icon: '✨' };
  if (n.includes('leva') || n.includes('traz')) return { grad: 'grad-delivery', icon: '🚗' };
  return { grad: 'grad-default', icon: '🔧' };
}

async function loadServicos() {
  const tbody = $('servicosBody');
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:2rem">Carregando...</td></tr>`;
  try {
    S.servicos = await api('/api/admin/servicos');
    if (!S.servicos.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🔧</div><p>Nenhum serviço cadastrado ainda.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = S.servicos.map(s => {
      const v = svcVisualAdmin(s.nome);
      const thumb = s.imagem_path
        ? `<img src="${s.imagem_path}" width="48" height="48" style="border-radius:8px;object-fit:cover;display:block" />`
        : `<div class="svc-thumb-mini ${v.grad}">${v.icon}</div>`;
      return `
        <tr>
          <td>
            <div class="service-img-cell">
              ${thumb}
              <div class="svc-name-block">
                <div class="svc-name">${s.nome}</div>
                <div class="svc-desc-short">${(s.descricao || '').slice(0,50)}${(s.descricao || '').length > 50 ? '…' : ''}</div>
              </div>
            </div>
          </td>
          <td>${s.preco ? formatMoney(s.preco) : '<span style="color:#6b7280">—</span>'}</td>
          <td>${formatDur(s.duracao_minutos)}</td>
          <td><span class="badge ${s.ativo ? 'badge-confirmado' : 'badge-cancelado'}">${s.ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td>
            <div class="action-btns">
              <button class="btn-act btn-edit" onclick="editarServico(${s.id})">✏️ Editar</button>
              <button class="btn-act btn-delete" onclick="desativarServico(${s.id},${s.ativo})">${s.ativo ? '⊘ Desativar' : '✓ Ativar'}</button>
              <button class="btn-act btn-destroy" onclick="excluirServico(${s.id},'${s.nome.replace(/'/g, "\\'")}')">🗑️ Excluir</button>
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
  $('smSaveBtn').textContent = id ? 'Salvar alterações' : 'Criar serviço';

  if (id) {
    const s = S.servicos.find(x => x.id === id);
    if (!s) return;
    $('smNome').value = s.nome || '';
    $('smDesc').value = s.descricao || '';
    $('smPreco').value = s.preco || '';
    $('smDuracao').value = s.duracao_minutos || '';
    $('smAtivo').checked = !!s.ativo;
    $('smImgPath').value = s.imagem_path || '';
    if (s.imagem_path) {
      $('smImgPreview').src = s.imagem_path;
      $('smImgPreview').style.display = '';
    } else {
      $('smImgPreview').style.display = 'none';
    }
  } else {
    $('servicoModal').querySelector('form') && $('servicoModal').querySelector('form').reset();
    $('smNome').value = ''; $('smDesc').value = ''; $('smPreco').value = '';
    $('smDuracao').value = ''; $('smAtivo').checked = true;
    $('smImgPath').value = ''; $('smImgPreview').style.display = 'none';
  }
  openModal('servicoModal');
}

function editarServico(id) { openServicoModal(id); }
function closeServicoModal() { closeModal('servicoModal'); }

async function previewImagem(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('Imagem deve ter no máximo 5MB.', 'error'); input.value = ''; return; }

  const preview = $('smImgPreview');
  const reader = new FileReader();
  reader.onload = e => { preview.src = e.target.result; preview.style.display = ''; };
  reader.readAsDataURL(file);

  // Upload
  const fd = new FormData(); fd.append('imagem', file);
  try {
    const r = await fetch('/api/admin/servicos/upload', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    $('smImgPath').value = data.path;
  } catch (e) { showToast('Erro no upload: ' + e.message, 'error'); }
}

async function salvarServico() {
  const nome = $('smNome').value.trim();
  const duracao_minutos = parseInt($('smDuracao').value);
  if (!nome) { showToast('Nome é obrigatório.', 'error'); return; }
  if (!duracao_minutos || duracao_minutos < 1) { showToast('Duração inválida.', 'error'); return; }

  const body = {
    nome,
    descricao: $('smDesc').value.trim() || null,
    preco: parseFloat($('smPreco').value) || null,
    duracao_minutos,
    imagem_path: $('smImgPath').value || null,
    ativo: $('smAtivo').checked
  };

  try {
    if (S.editingServicoId) {
      await api(`/api/admin/servicos/${S.editingServicoId}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Serviço atualizado!');
    } else {
      await api('/api/admin/servicos', { method: 'POST', body: JSON.stringify(body) });
      showToast('Serviço criado!');
    }
    closeServicoModal();
    loadServicos();
  } catch (e) { showToast(e.message, 'error'); }
}

async function desativarServico(id, ativo) {
  const acao = ativo ? 'desativar' : 'ativar';
  const ok = await showConfirm({
    title: ativo ? 'Desativar serviço' : 'Ativar serviço',
    msg: `Tem certeza que deseja ${acao} este serviço?`,
    icon: ativo ? '⊘' : '✓',
    okLabel: ativo ? 'Desativar' : 'Ativar',
    danger: ativo
  });
  if (!ok) return;
  try {
    const s = S.servicos.find(x => x.id === id);
    await api(`/api/admin/servicos/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ativo: !ativo,
        nome: s?.nome,
        descricao: s?.descricao,
        preco: s?.preco,
        duracao_minutos: s?.duracao_minutos,
        imagem_path: s?.imagem_path
      })
    });
    showToast(`Serviço ${ativo ? 'desativado' : 'ativado'}!`);
    loadServicos();
  } catch (e) { showToast(e.message, 'error'); }
}

async function excluirServico(id, nome) {
  const ok = await showConfirm({
    title: 'Excluir serviço',
    msg: `Excluir permanentemente "${nome}"?`,
    sub: 'Esta ação não pode ser desfeita.',
    icon: '🗑️',
    okLabel: 'Excluir permanentemente',
    danger: true
  });
  if (!ok) return;
  try {
    await api(`/api/admin/servicos/${id}`, { method: 'DELETE' });
    showToast('Serviço excluído permanentemente.');
    loadServicos();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── AVALIAÇÕES ────────────────────────────────────────────────────────────────
async function loadAvaliacoes() {
  const list = $('avaliacoesAdminList');
  list.innerHTML = '<div style="text-align:center;color:#6b7280;padding:3rem">Carregando...</div>';
  try {
    S.avaliacoes = await api('/api/admin/avaliacoes');
    renderAvaliacoes();
  } catch (e) { list.innerHTML = `<div style="text-align:center;color:#f87171;padding:2rem">Erro: ${e.message}</div>`; }
}

function setRavFilter(f) {
  S.ravFilter = f;
  document.querySelectorAll('.filter-tab[data-ravfilt]').forEach(t =>
    t.classList.toggle('active', t.dataset.ravfilt === f));
  renderAvaliacoes();
}

function renderAvaliacoes() {
  const list = $('avaliacoesAdminList');
  let items = S.avaliacoes;
  if (S.ravFilter !== 'todas') items = items.filter(a => a.status === S.ravFilter);

  if (!items.length) {
    list.innerHTML = '<div style="text-align:center;color:#6b7280;padding:3rem">Nenhuma avaliação encontrada.</div>';
    return;
  }

  list.innerHTML = items.map(a => `
    <div class="review-admin-card">
      <div>
        <div class="rac-stars">${'★'.repeat(a.nota)}${'☆'.repeat(5-a.nota)}</div>
        <div class="rac-text">"${a.comentario || 'Sem comentário'}"</div>
        <div class="rac-author">— ${a.nome} &nbsp;·&nbsp; ${new Date(a.criado_em).toLocaleDateString('pt-BR')} &nbsp;·&nbsp; ${statusBadge(a.status)}</div>
      </div>
      <div class="rac-actions">
        ${a.status !== 'publicada' ? `<button class="btn-act btn-approve" onclick="atualizarAvaliacao(${a.id},'publicada')">Publicar</button>` : ''}
        ${a.status !== 'oculta' ? `<button class="btn-act btn-hide" onclick="atualizarAvaliacao(${a.id},'oculta')">Ocultar</button>` : ''}
        ${a.status !== 'pendente' ? `<button class="btn-act btn-details" onclick="atualizarAvaliacao(${a.id},'pendente')">Pendente</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function atualizarAvaliacao(id, status) {
  try {
    await api(`/api/admin/avaliacoes/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast(`Avaliação marcada como "${status}".`);
    loadAvaliacoes();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── CONFIGURAÇÕES ─────────────────────────────────────────────────────────────
async function loadConfigs() {
  try {
    const cfg = await api('/api/admin/configuracoes');
    $('cfgWa').value = cfg.whatsapp_numero || '';
    $('cfgEndereco').value = cfg.endereco || '';
    $('cfgHorario').value = cfg.horario_funcionamento || '';
  } catch (e) { showToast(e.message, 'error'); }
}

async function salvarConfigs() {
  try {
    await api('/api/admin/configuracoes', {
      method: 'PUT',
      body: JSON.stringify({
        whatsapp_numero: $('cfgWa').value.replace(/\D/g,''),
        endereco: $('cfgEndereco').value.trim(),
        horario_funcionamento: $('cfgHorario').value.trim()
      })
    });
    showToast('Configurações salvas!');
  } catch (e) { showToast(e.message, 'error'); }
}

async function alterarSenha() {
  const atual = $('cfgSenhaAtual').value;
  const nova = $('cfgNovaSenha').value;
  if (!atual || !nova) { showToast('Preencha os dois campos.', 'warning'); return; }
  if (nova.length < 6) { showToast('Nova senha deve ter ao menos 6 caracteres.', 'error'); return; }
  try {
    await api('/api/admin/senha', { method: 'PUT', body: JSON.stringify({ senha_atual: atual, nova_senha: nova }) });
    showToast('Senha alterada com sucesso!');
    $('cfgSenhaAtual').value = ''; $('cfgNovaSenha').value = '';
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── TOGGLE LABEL ─────────────────────────────────────────────────────────────
document.addEventListener('change', e => {
  if (e.target.id === 'smAtivo') {
    $('smAtivoLabel').textContent = e.target.checked ? 'Ativo (visível no site)' : 'Inativo (oculto no site)';
  }
});

// ─── CLOSE MODAL ON OVERLAY CLICK ─────────────────────────────────────────────
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ─── START ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
