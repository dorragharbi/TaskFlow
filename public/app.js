const $ = (s) => document.querySelector(s);
const PRIO = { high: 'Haute', medium: 'Moyenne', low: 'Basse' };
const COL = { todo: 'À faire', doing: 'En cours', done: 'Terminé' };
let tasks = [], cats = [], view = 'list', status = 'all', editingId = null, authMode = 'login';
let token = localStorage.getItem('tf_token');
const notified = new Set();

// ---------- Utilitaires ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('sv');
const fmt = (d) => new Date(d + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const catOf = (id) => cats.find((c) => c.id === id);
const isLate = (t) => t.status !== 'done' && t.due_date && t.due_date < today();

function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}

async function api(url, method = 'GET', body) {
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body && JSON.stringify(body) });
    if (r.status === 401 && token) { logout(); throw new Error('Session expirée, reconnectez-vous.'); }
    if (!r.ok) throw new Error((await r.json()).error || 'Erreur');
    return r.status === 204 ? null : r.json();
  } catch (e) { toast(e.message, true); throw e; }
}

// ---------- Connexion / inscription ----------
function showAuth() {
  $('#auth').hidden = false; $('#app').hidden = true;
  const reg = authMode === 'register';
  $('#nameRow').hidden = !reg; $('#aName').required = reg;
  $('#authSub').textContent = reg ? 'Créez votre espace personnel.' : 'Connectez-vous pour retrouver vos tâches.';
  $('#authBtn').textContent = reg ? 'Créer mon compte' : 'Se connecter';
  $('#authSwitch').textContent = reg ? 'Déjà un compte ? Se connecter' : 'Pas de compte ? Créer un compte';
}
$('#authSwitch').onclick = () => { authMode = authMode === 'login' ? 'register' : 'login'; showAuth(); };
$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { name: $('#aName').value, email: $('#aEmail').value, password: $('#aPass').value };
  try {
    const r = await fetch('/api/auth/' + authMode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    token = data.token; localStorage.setItem('tf_token', token); localStorage.setItem('tf_user', data.user.name);
    $('#aPass').value = ''; boot();
  } catch (err) { toast(err.message, true); }
});
function logout() { token = null; localStorage.removeItem('tf_token'); tasks = []; showAuth(); }
$('#logout').onclick = logout;

async function boot() {
  $('#auth').hidden = true; $('#app').hidden = false;
  $('#who').textContent = localStorage.getItem('tf_user') || '';
  await loadCats(); await loadTasks();
}
async function loadCats() { cats = await api('/api/categories'); fillCats(); }
async function loadTasks() { tasks = await api('/api/tasks'); render(); checkReminders(); }

function fillCats() {
  const cur = $('#catFilter').value || 'all';
  $('#catFilter').innerHTML = '<option value="all">Toutes catégories</option>' + cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#catFilter').value = cats.some((c) => String(c.id) === cur) ? cur : 'all';
  $('#fCat').innerHTML = '<option value="">Sans catégorie</option>' + cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#catList').innerHTML = cats.map((c) => `<span class="chip"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}<button data-c="${c.id}" aria-label="Supprimer ${esc(c.name)}">✕</button></span>`).join('') || '<p class="d">Aucune catégorie.</p>';
}

// ---------- Affichage ----------
function card(t) {
  const c = catOf(t.category_id);
  return `<${view === 'list' ? 'li' : 'div'} class="task ${t.priority} ${t.status === 'done' ? 'done' : ''}" data-id="${t.id}" draggable="${view === 'board'}">
    <input type="checkbox" class="check" ${t.status === 'done' ? 'checked' : ''} aria-label="Terminer la tâche">
    <div>
      <div class="t">${esc(t.title)}</div>
      ${t.description ? `<p class="d">${esc(t.description)}</p>` : ''}
      <div class="meta">
        ${c ? `<span class="cat"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</span>` : ''}
        <span>Priorité ${PRIO[t.priority].toLowerCase()}</span>
        ${t.due_date ? `<span class="${isLate(t) ? 'late' : ''}">${isLate(t) ? 'En retard : ' : 'Pour le '}${fmt(t.due_date)}</span>` : ''}
      </div>
    </div>
    <div class="acts"><button data-a="edit">Modifier</button><button data-a="del">Supprimer</button></div>
  </${view === 'list' ? 'li' : 'div'}>`;
}

function filtered(ignoreStatus) {
  const q = $('#search').value.toLowerCase(), p = $('#prioFilter').value, c = $('#catFilter').value;
  return tasks.filter((t) =>
    (ignoreStatus || status === 'all' || t.status === status) &&
    (p === 'all' || t.priority === p) && (c === 'all' || String(t.category_id) === c) &&
    (t.title + ' ' + (t.description || '')).toLowerCase().includes(q));
}

function render() {
  const n = tasks.length, done = tasks.filter((t) => t.status === 'done').length, pct = n ? Math.round((done / n) * 100) : 0;
  $('#summaryText').textContent = n ? `${n - done} à faire, ${done} terminée${done > 1 ? 's' : ''} (${pct} %)` : 'Aucune tâche pour le moment';
  $('#barFill').style.width = pct + '%';
  $('#list').hidden = view !== 'list'; $('#board').hidden = view !== 'board'; $('#dash').hidden = view !== 'dash';
  $('#filters').hidden = view === 'dash'; $('#statusSeg').hidden = view !== 'list';
  if (view === 'list') {
    const shown = filtered();
    $('#list').innerHTML = shown.length ? shown.map(card).join('') : `<li class="empty">${n ? 'Aucun résultat pour ces filtres.' : 'Ajoutez votre première tâche pour démarrer.'}</li>`;
  } else if (view === 'board') {
    const shown = filtered(true);
    $('#board').innerHTML = Object.keys(COL).map((s) => {
      const col = shown.filter((t) => t.status === s);
      return `<div class="col" data-s="${s}"><h3>${COL[s]} <span>${col.length}</span></h3>${col.map(card).join('') || '<p class="d">Déposez une tâche ici</p>'}</div>`;
    }).join('');
  } else renderDash();
}

function bars(rows, total) {
  return rows.map(([l, v, color]) => `<div class="hb"><span>${esc(l)}</span><i style="width:${total ? (v / total) * 100 : 0}%;background:${color}"></i><b>${v}</b></div>`).join('');
}
function renderDash() {
  const n = tasks.length, cnt = (f) => tasks.filter(f).length, done = cnt((t) => t.status === 'done');
  const pct = n ? Math.round((done / n) * 100) : 0;
  const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString('sv'); return [d.slice(5), cnt((t) => (t.completed_at || '').startsWith(d)), 'var(--gold)']; });
  const max = Math.max(1, ...days.map((d) => d[1]));
  const catRows = cats.map((c) => [c.name, cnt((t) => t.category_id === c.id), c.color]);
  catRows.push(['Sans catégorie', cnt((t) => !catOf(t.category_id)), 'var(--muted)']);
  $('#dash').innerHTML = `
    <div class="panel"><h3>Progression</h3>
      <div class="donut" style="background:conic-gradient(var(--gold) 0 ${pct}%, var(--line) 0)"><b>${pct} %</b></div>
      <p class="d" style="text-align:center">${done} terminée${done > 1 ? 's' : ''} sur ${n}, ${cnt(isLate)} en retard</p></div>
    <div class="panel"><h3>Par statut</h3>${bars(Object.keys(COL).map((s) => [COL[s], cnt((t) => t.status === s), 'var(--brand)']), n)}
      <h3 style="margin-top:18px">Par priorité</h3>${bars(['high', 'medium', 'low'].map((p) => [PRIO[p], cnt((t) => t.priority === p), `var(--${p})`]), n)}</div>
    <div class="panel"><h3>Par catégorie</h3>${bars(catRows, n)}</div>
    <div class="panel"><h3>Terminées ces 7 derniers jours</h3>${bars(days, max)}</div>`;
}

// ---------- Actions sur les tâches ----------
async function save(t, patch) { await api('/api/tasks/' + t.id, 'PUT', { ...t, ...patch }); await loadTasks(); }

async function onClick(e) {
  const el = e.target.closest('.task'); if (!el) return;
  const t = tasks.find((x) => x.id == el.dataset.id);
  if (e.target.classList.contains('check')) { await save(t, { status: e.target.checked ? 'done' : 'todo' }); toast(e.target.checked ? 'Tâche terminée' : 'Tâche rouverte'); }
  else if (e.target.dataset.a === 'edit') openForm(t);
  else if (e.target.dataset.a === 'del') { $('#delText').textContent = `Supprimer « ${t.title} » ?`; $('#delDlg').dataset.id = t.id; $('#delDlg').showModal(); }
}
$('#list').addEventListener('click', onClick); $('#board').addEventListener('click', onClick);
$('#delCancel').onclick = () => $('#delDlg').close();
$('#delOk').onclick = async () => { const id = $('#delDlg').dataset.id; $('#delDlg').close(); await api('/api/tasks/' + id, 'DELETE'); toast('Tâche supprimée'); loadTasks(); };

// Glisser-déposer (Kanban)
$('#board').addEventListener('dragstart', (e) => { const el = e.target.closest('.task'); if (el) e.dataTransfer.setData('text/plain', el.dataset.id); });
$('#board').addEventListener('dragover', (e) => { const c = e.target.closest('.col'); if (c) { e.preventDefault(); document.querySelectorAll('.col').forEach((x) => x.classList.toggle('over', x === c)); } });
$('#board').addEventListener('dragleave', (e) => { if (!e.relatedTarget?.closest('.col')) document.querySelectorAll('.col').forEach((x) => x.classList.remove('over')); });
$('#board').addEventListener('drop', async (e) => {
  const c = e.target.closest('.col'); if (!c) return;
  e.preventDefault();
  const t = tasks.find((x) => x.id == e.dataTransfer.getData('text/plain'));
  if (t && t.status !== c.dataset.s) { await save(t, { status: c.dataset.s }); toast(`Déplacée vers « ${COL[c.dataset.s]} »`); } else render();
});

// Formulaire
const dlg = $('#dlg');
function openForm(t = null) {
  editingId = t?.id ?? null;
  $('#dlgTitle').textContent = t ? 'Modifier la tâche' : 'Nouvelle tâche';
  $('#fTitle').value = t?.title ?? ''; $('#fDesc').value = t?.description ?? '';
  $('#fPrio').value = t?.priority ?? 'medium'; $('#fStatus').value = t?.status ?? 'todo';
  $('#fCat').value = t?.category_id ?? ''; $('#fDue').value = t?.due_date ?? '';
  dlg.showModal(); $('#fTitle').focus();
}
$('#add').onclick = () => openForm();
$('#cancel').onclick = () => dlg.close();
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = { title: $('#fTitle').value, description: $('#fDesc').value, priority: $('#fPrio').value, status: $('#fStatus').value, category_id: $('#fCat').value || null, due_date: $('#fDue').value || null };
  await api(editingId ? '/api/tasks/' + editingId : '/api/tasks', editingId ? 'PUT' : 'POST', data);
  dlg.close(); toast(editingId ? 'Modifications enregistrées' : 'Tâche ajoutée'); loadTasks();
});

// Catégories
$('#cats').onclick = () => $('#catDlg').showModal();
$('#catClose').onclick = () => $('#catDlg').close();
$('#catForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/categories', 'POST', { name: $('#cName').value, color: $('#cColor').value });
  $('#cName').value = ''; toast('Catégorie ajoutée'); await loadCats(); render();
});
$('#catList').addEventListener('click', async (e) => {
  if (!e.target.dataset.c) return;
  await api('/api/categories/' + e.target.dataset.c, 'DELETE'); toast('Catégorie supprimée'); await loadCats(); await loadTasks();
});

// ---------- Onglets et filtres ----------
$('#tabs').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  view = e.target.dataset.v;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b === e.target)); render();
});
$('#statusSeg').addEventListener('click', (e) => {
  if (!e.target.dataset.s) return;
  status = e.target.dataset.s;
  document.querySelectorAll('#statusSeg button').forEach((b) => b.classList.toggle('on', b === e.target)); render();
});
['#prioFilter', '#catFilter'].forEach((s) => ($(s).onchange = render)); $('#search').oninput = render;

// ---------- Mode sombre ----------
function setTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); $('#theme').textContent = t === 'dark' ? '☀' : '☾'; }
setTheme(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

// ---------- Rappels ----------
function checkReminders() {
  const d = today();
  tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date <= d && !notified.has(t.id)).forEach((t) => {
    notified.add(t.id);
    const msg = t.due_date < d ? `En retard : ${t.title}` : `Pour aujourd'hui : ${t.title}`;
    toast(msg, t.due_date < d);
    if ('Notification' in window && Notification.permission === 'granted') new Notification('TaskFlow', { body: msg });
  });
}
function updateBell() { $('#bell').classList.toggle('active', 'Notification' in window && Notification.permission === 'granted'); }
$('#bell').onclick = async () => {
  if (!('Notification' in window)) return toast('Notifications non supportées', true);
  const r = await Notification.requestPermission();
  updateBell(); toast(r === 'granted' ? 'Rappels activés' : 'Rappels refusés', r !== 'granted');
};
updateBell(); setInterval(checkReminders, 60000);

token ? boot() : showAuth();
$('#year').textContent = new Date().getFullYear();
