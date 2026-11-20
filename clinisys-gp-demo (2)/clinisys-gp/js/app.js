// CliniSYS GP – Main Application Logic (hardened + best-effort error handling)

let currentVisit = null;
let orderedItems = [];

/* ---------- Global error handlers (must be first) ---------- */
window.addEventListener('error', (event) => {
  console.error('[CliniSYS] Uncaught error:', event.error || event.message);
  try {
    toast('Something went wrong. You can continue or use Reset Demo Data.', true);
  } catch (_) { /* toast may not exist yet */ }
  // Prevent default only for our own scripts to avoid noisy browser overlays
  return false;
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[CliniSYS] Unhandled promise rejection:', event.reason);
  try {
    toast('An unexpected error occurred. Please try again.', true);
  } catch (_) {}
  event.preventDefault();
});

/* ---------- Security helpers ---------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeText(el, text) {
  if (el) el.textContent = text == null ? '' : String(text);
}

function clampNumber(val, min = 0, max = 999999) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/* ---------- Malaysian IC → DOB / Gender ---------- */
function parseMalaysianIC(icRaw) {
  try {
    const digits = String(icRaw || '').replace(/\D/g, '');
    if (digits.length < 6) return null;
    const yy = parseInt(digits.slice(0, 2), 10);
    const mm = parseInt(digits.slice(2, 4), 10);
    const dd = parseInt(digits.slice(4, 6), 10);
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const now = new Date();
    const currentYY = now.getFullYear() % 100;
    const fullYear = yy > currentYY ? 1900 + yy : 2000 + yy;
    const d = new Date(fullYear, mm - 1, dd);
    if (d.getFullYear() !== fullYear || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    if (d > now) return null;
    const iso =
      String(fullYear).padStart(4, '0') + '-' +
      String(mm).padStart(2, '0') + '-' +
      String(dd).padStart(2, '0');
    let gender = null;
    if (digits.length >= 12) {
      const last = parseInt(digits.slice(-1), 10);
      if (Number.isFinite(last)) gender = last % 2 === 1 ? 'Male' : 'Female';
    }
    return { dob: iso, gender };
  } catch (e) {
    console.warn('[CliniSYS] parseMalaysianIC', e);
    return null;
  }
}

function onICInput() {
  try {
    const icEl = document.getElementById('m-ic');
    if (!icEl) return;
    const parsed = parseMalaysianIC(icEl.value);
    if (!parsed) return;
    const dobEl = document.getElementById('m-dob');
    if (dobEl && parsed.dob) dobEl.value = parsed.dob;
    const genderEl = document.getElementById('m-gender');
    if (genderEl && parsed.gender) genderEl.value = parsed.gender;
  } catch (e) {
    console.warn('[CliniSYS] onICInput', e);
  }
}

/** Persist and surface storage problems to the user */
function saveChecked(key, data) {
  const result = save(key, data);
  if (!result.ok && result.message) {
    toast(result.message, true);
  }
  return result;
}

/* ---------- Bootstrap ---------- */
document.addEventListener('DOMContentLoaded', () => {
  try {
    const init = initData();
    if (init && init.repaired && init.repaired.length) {
      console.info('[CliniSYS] Data init:', init.repaired.join(', '));
    }
  } catch (e) {
    console.error('[CliniSYS] Init data failed', e);
    setTimeout(() => toast('Failed to load data. Try Reset Demo Data on the dashboard.', true), 500);
  }

  try {
    updateClock();
    setInterval(() => {
      try { updateClock(); } catch (e) { console.warn(e); }
    }, 1000);
  } catch (e) {
    console.warn('[CliniSYS] Clock failed', e);
  }

  try {
    const session = getCurrentUser();
    if (session) showApp(session);
  } catch (e) {
    console.warn('[CliniSYS] Session restore failed', e);
  }

  try {
    document.getElementById('login-pass')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
    document.getElementById('login-user')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-pass')?.focus();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        try { closeModal(); } catch (_) {}
      }
    });
  } catch (e) {
    console.warn('[CliniSYS] Event binding failed', e);
  }
});

function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem('clinisys_session');
    if (!raw) {
      const legacy = sessionStorage.getItem('clinisys_user');
      if (legacy) return { id: legacy, name: legacy, role: legacy === 'admin' ? 'admin' : 'doctor' };
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function updateClock() {
  try {
    const el = document.getElementById('clock');
    if (el) {
      el.textContent = new Date().toLocaleString('en-MY', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit'
      });
    }
  } catch (e) {
    console.warn('[CliniSYS] updateClock', e);
  }
}

function doLogin() {
  try {
    const userId = (document.getElementById('login-user')?.value || '').trim().toLowerCase();
    const pass = document.getElementById('login-pass')?.value || '';
    if (!userId || !pass) {
      toast('Please enter User ID and Password', true);
      return;
    }
    const users = load('users', typeof DEFAULT_USERS !== 'undefined' ? DEFAULT_USERS : []);
    const found = users.find(u => String(u.id).toLowerCase() === userId && u.password === pass);
    if (!found) {
      toast('Invalid login. Try admin/admin · doctor/doctor · nurse/nurse · cashier/cashier', true);
      const passEl = document.getElementById('login-pass');
      if (passEl) { passEl.value = ''; passEl.focus(); }
      return;
    }
    const session = { id: found.id, name: found.name, role: found.role };
    try {
      sessionStorage.setItem('clinisys_session', JSON.stringify(session));
      sessionStorage.setItem('clinisys_user', found.id);
    } catch (e) {
      console.warn('[CliniSYS] sessionStorage write failed', e);
      toast('Session could not be saved (private mode?). You can still use the app.', true);
    }
    showApp(session);
    toast('Welcome, ' + (found.name || found.id));
  } catch (e) {
    console.error('[CliniSYS] doLogin', e);
    toast('Login failed unexpectedly. Refresh the page and try again.', true);
  }
}

function doLogout() {
  try {
    if (!confirm('Log out of CliniSYS GP?')) return;
    try {
      sessionStorage.removeItem('clinisys_user');
      sessionStorage.removeItem('clinisys_session');
    } catch (_) {}
    currentVisit = null;
    orderedItems = [];
    document.getElementById('app-screen')?.classList.add('hidden');
    document.getElementById('login-screen')?.classList.remove('hidden');
    const pass = document.getElementById('login-pass');
    if (pass) pass.value = '';
  } catch (e) {
    console.error('[CliniSYS] doLogout', e);
    toast('Logout had a problem. Refresh the page.', true);
  }
}

function applyRoleNav(role) {
  try {
    const allowed = (typeof ROLE_VIEWS !== 'undefined' && ROLE_VIEWS[role]) ? ROLE_VIEWS[role] : null;
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      const view = el.getAttribute('data-view');
      if (!allowed || allowed.includes(view)) {
        el.classList.remove('hidden');
        el.style.display = '';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    });
  } catch (e) {
    console.warn('[CliniSYS] applyRoleNav', e);
  }
}

function showApp(userOrSession) {
  try {
    const session = typeof userOrSession === 'object' && userOrSession
      ? userOrSession
      : getCurrentUser() || { id: String(userOrSession || 'admin'), name: String(userOrSession || 'admin'), role: 'admin' };
    document.getElementById('login-screen')?.classList.add('hidden');
    document.getElementById('app-screen')?.classList.remove('hidden');
    const label = (session.name || session.id) + (session.role ? ' · ' + session.role : '');
    safeText(document.getElementById('current-user'), label);
    applyRoleNav(session.role || 'admin');
    showView('dashboard');
    refreshStats();
  } catch (e) {
    console.error('[CliniSYS] showApp', e);
    toast('Could not open the main app. Refresh the page.', true);
  }
}

function toggleSidebar() {
  try {
    document.getElementById('sidebar')?.classList.toggle('-translate-x-full');
    document.getElementById('sidebar-overlay')?.classList.toggle('hidden');
  } catch (e) {
    console.warn('[CliniSYS] toggleSidebar', e);
  }
}

function showView(name) {
  try {
    if (!name || typeof name !== 'string') {
      toast('Invalid screen', true);
      return;
    }
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById('view-' + name);
    if (!target) {
      console.error('[CliniSYS] View not found:', name);
      toast('This screen is not available.', true);
      return;
    }
    target.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelector(`.nav-item[data-view="${name}"]`);
    if (nav) nav.classList.add('active');

    document.getElementById('sidebar')?.classList.add('-translate-x-full');
    document.getElementById('sidebar-overlay')?.classList.add('hidden');

    if (name === 'dashboard') refreshStats();
    if (name === 'registration') renderPatientTable();
    if (name === 'queue') renderQueue();
    if (name === 'consultation') {
      populateConsultSelect();
      document.getElementById('consult-empty')?.classList.remove('hidden');
      document.getElementById('consult-workspace')?.classList.add('hidden');
      currentVisit = null;
      orderedItems = [];
    }
    if (name === 'dispensary') {
      populateDispSelect();
      document.getElementById('disp-empty')?.classList.remove('hidden');
      document.getElementById('disp-workspace')?.classList.add('hidden');
    }
    if (name === 'payment') {
      populatePaySelect();
      document.getElementById('pay-empty')?.classList.remove('hidden');
      document.getElementById('pay-workspace')?.classList.add('hidden');
    }
    if (name === 'mc') populateMCSelect();
    if (name === 'stock') renderStockTable();
    if (name === 'supplier') renderSupplierTable();
    if (name === 'regime') renderRegimes();
    if (name === 'purchase') populatePOSelects();
    if (name === 'goods-receive') populateGRSelect();
  } catch (err) {
    console.error('[CliniSYS] View render error:', name, err);
    toast('Something went wrong loading this screen. Try again or Reset Demo Data.', true);
  }
}

function toast(msg, isError = false) {
  try {
    const t = document.getElementById('toast');
    if (!t) {
      if (isError) console.error('[CliniSYS]', msg);
      else console.info('[CliniSYS]', msg);
      return;
    }
    t.textContent = String(msg || '');
    t.classList.remove('hidden', 'bg-slate-800', 'bg-red-600');
    t.classList.add(isError ? 'bg-red-600' : 'bg-slate-800');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      try { t.classList.add('hidden'); } catch (_) {}
    }, isError ? 4500 : 3000);
  } catch (e) {
    console.error('[CliniSYS] toast failed', e, msg);
  }
}

function refreshStats() {
  try {
    const queue = load('queue', []);
    const patients = load('patients', []);
    const drugs = load('drugs', []);
    safeText(document.getElementById('stat-queue'), queue.filter(q => !['DONE', 'BILL'].includes(q.status)).length);
    safeText(document.getElementById('stat-registered'), patients.length);
    safeText(document.getElementById('stat-stock'), drugs.length);
    safeText(document.getElementById('stat-payment'), queue.filter(q => q.status === 'FDIS').length);
  } catch (e) {
    console.error(e);
  }
}

/* ---------- Reset demo data (helpful for users) ---------- */
function resetDemoData() {
  try {
    if (!confirm('This will clear ALL patients, queue, visits and stock changes, and restore sample data.\n\nContinue?')) return;
    const keys = ['drugs', 'suppliers', 'regimes', 'patients', 'queue', 'visits', 'pos'];
    keys.forEach(k => {
      try { localStorage.removeItem('clinisys_' + k); } catch (e) { console.warn(e); }
    });
    try {
      if (typeof memoryStore === 'object') {
        keys.forEach(k => { try { delete memoryStore[k]; } catch (_) {} });
      }
    } catch (_) {}
    initData();
    currentVisit = null;
    orderedItems = [];
    window._currentDispVisit = null;
    window._currentPayVisit = null;
    toast('Demo data restored');
    showView('dashboard');
  } catch (e) {
    console.error('[CliniSYS] resetDemoData', e);
    toast('Reset failed. Try clearing site data in your browser settings.', true);
  }
}

/* ========== PATIENTS ========== */
function renderPatientTable() {
  const patients = load('patients', []);
  const q = (document.getElementById('reg-search')?.value || '').toLowerCase().trim();
  const type = document.getElementById('reg-filter-type')?.value || '';
  const tbody = document.getElementById('patient-table-body');
  if (!tbody) return;

  const filtered = patients.filter(p => {
    const matchQ = !q ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.ic || '').includes(q) ||
      (p.phone || '').includes(q);
    const matchT = !type || p.type === type;
    return matchQ && matchT;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">No patients found. Click “New Patient”.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td class="px-4 py-3 font-medium">${escapeHtml(p.name)}</td>
      <td class="px-4 py-3">${escapeHtml(p.ic)}</td>
      <td class="px-4 py-3"><span class="badge ${p.type === 'Panel' ? 'badge-fcon' : 'badge-reg'}">${escapeHtml(p.type)}</span></td>
      <td class="px-4 py-3">${escapeHtml(p.phone || '—')}</td>
      <td class="px-4 py-3">${escapeHtml(p.created || '—')}</td>
      <td class="px-4 py-3 text-right space-x-1">
        <button onclick="registerToQueue('${escapeHtml(p.id)}')" class="text-primary-600 hover:underline text-xs font-medium">Register to Queue</button>
        <button onclick="editPatient('${escapeHtml(p.id)}')" class="text-slate-500 hover:underline text-xs">Edit</button>
      </td>
    </tr>
  `).join('');
}

function openPatientModal(editId = null) {
  const patients = load('patients', []);
  const p = editId ? patients.find(x => x.id === editId) : null;
  const content = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-lg font-bold">${p ? 'Edit Patient' : 'New Patient Registration'}</h2>
        <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Full Name *</label>
            <input id="m-name" value="${escapeHtml(p?.name || '')}" maxlength="80" class="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">IC / Passport *</label>
            <input id="m-ic" value="${escapeHtml(p?.ic || '')}" maxlength="20" class="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" oninput="onICInput()" onblur="onICInput()" placeholder="e.g. 890101145678" />
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Gender</label>
            <select id="m-gender" class="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option ${p?.gender === 'Male' ? 'selected' : ''}>Male</option>
              <option ${p?.gender === 'Female' ? 'selected' : ''}>Female</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Date of Birth</label>
            <input id="m-dob" type="date" value="${escapeHtml(p?.dob || '')}" class="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Type</label>
            <select id="m-type" class="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" onchange="togglePanelField()">
              <option ${p?.type === 'Cash' ? 'selected' : ''}>Cash</option>
              <option ${p?.type === 'Panel' ? 'selected' : ''}>Panel</option>
            </select>
          </div>
        </div>
        <div id="panel-field" class="${(p?.type === 'Panel') ? '' : 'hidden'}">
          <label class="text-xs font-medium text-slate-500">Panel / Paying Company</label>
          <input id="m-panel" value="${escapeHtml(p?.panel || '')}" maxlength="100" class="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. MedexOne Global Sdn Bhd" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Phone</label>
            <input id="m-phone" value="${escapeHtml(p?.phone || '')}" maxlength="20" class="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Allergy</label>
            <input id="m-allergy" value="${escapeHtml(p?.allergy || '')}" maxlength="100" class="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="None" />
          </div>
        </div>
        <div>
          <label class="text-xs font-medium text-slate-500">Address</label>
          <input id="m-address" value="${escapeHtml(p?.address || '')}" maxlength="150" class="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div class="pt-2 flex gap-2">
          <button onclick="savePatient('${escapeHtml(editId || '')}')" class="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg font-medium">Save Patient</button>
          <button onclick="closeModal()" class="px-4 py-2.5 border border-slate-300 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  `;
  openModal(content);
  setTimeout(() => document.getElementById('m-name')?.focus(), 50);
}

function togglePanelField() {
  const type = document.getElementById('m-type')?.value;
  document.getElementById('panel-field')?.classList.toggle('hidden', type !== 'Panel');
}

function savePatient(editId) {
  const name = (document.getElementById('m-name')?.value || '').trim();
  const ic = (document.getElementById('m-ic')?.value || '').trim();
  if (!name || !ic) {
    toast('Name and IC are required', true);
    return;
  }
  if (ic.length < 5) {
    toast('IC / Passport looks too short', true);
    return;
  }
  const patients = load('patients', []);
  // Prevent duplicate IC when creating new
  if (!editId && patients.some(p => p.ic === ic)) {
    toast('A patient with this IC already exists', true);
    return;
  }
  const data = {
    id: editId || uid('P'),
    name,
    ic,
    gender: document.getElementById('m-gender')?.value || 'Male',
    dob: document.getElementById('m-dob')?.value || '',
    type: document.getElementById('m-type')?.value || 'Cash',
    panel: (document.getElementById('m-panel')?.value || '').trim(),
    phone: (document.getElementById('m-phone')?.value || '').trim(),
    allergy: (document.getElementById('m-allergy')?.value || '').trim(),
    address: (document.getElementById('m-address')?.value || '').trim(),
    created: editId ? (patients.find(p => p.id === editId)?.created || today()) : today()
  };
  if (editId) {
    const idx = patients.findIndex(p => p.id === editId);
    if (idx >= 0) patients[idx] = data;
  } else {
    patients.push(data);
  }
  saveChecked('patients', patients);
  closeModal();
  renderPatientTable();
  refreshStats();
  toast(editId ? 'Patient updated' : 'Patient registered successfully');
}

function editPatient(id) {
  openPatientModal(id);
}

function registerToQueue(patientId) {
  const patients = load('patients', []);
  const p = patients.find(x => x.id === patientId);
  if (!p) {
    toast('Patient not found', true);
    return;
  }
  const queue = load('queue', []);
  if (queue.some(q => q.patientId === patientId && !['DONE', 'BILL'].includes(q.status))) {
    toast('Patient is already in the active queue', true);
    return;
  }
  const visit = {
    id: uid('V'),
    patientId: p.id,
    name: p.name,
    ic: p.ic,
    status: 'REG',
    doctor: 'DR HENRY TAN',
    reason: 'General',
    timeIn: nowTime(),
    date: today(),
    notes: '',
    summary: '',
    items: [],
    consultFee: 30,
    medTotal: 0
  };
  queue.push(visit);
  saveChecked('queue', queue);
  toast(`${p.name} added to queue (REG)`);
  showView('queue');
  refreshStats();
}

/* ========== QUEUE ========== */
function renderQueue() {
  const queue = load('queue', []);
  const tbody = document.getElementById('queue-table-body');
  if (!tbody) return;

  if (!queue.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-10 text-center text-slate-400">Queue is empty. Register a patient first.</td></tr>';
    return;
  }

  tbody.innerHTML = queue.slice().reverse().map((q, i) => {
    const badge = {
      REG: 'badge-reg', FCON: 'badge-fcon', FDIS: 'badge-fdis', BILL: 'badge-bill', DONE: 'badge-done'
    }[q.status] || 'badge-reg';
    const actions = {
      REG: `<button onclick="goConsult('${escapeHtml(q.id)}')" class="text-primary-600 text-xs font-medium hover:underline">Consult</button>`,
      FCON: `<button onclick="goDisp('${escapeHtml(q.id)}')" class="text-amber-600 text-xs font-medium hover:underline">Dispense</button>`,
      FDIS: `<button onclick="goPay('${escapeHtml(q.id)}')" class="text-emerald-600 text-xs font-medium hover:underline">Pay</button>`,
      DONE: '<span class="text-slate-400 text-xs">Completed</span>',
      BILL: '<span class="text-slate-400 text-xs">Completed</span>'
    }[q.status] || '';
    return `
      <tr>
        <td class="px-4 py-3">${queue.length - i}</td>
        <td class="px-4 py-3"><span class="badge ${badge}">${escapeHtml(q.status)}</span></td>
        <td class="px-4 py-3 font-medium">${escapeHtml(q.name)}</td>
        <td class="px-4 py-3">${escapeHtml(q.ic)}</td>
        <td class="px-4 py-3">${escapeHtml(q.doctor)}</td>
        <td class="px-4 py-3">${escapeHtml(q.reason)}</td>
        <td class="px-4 py-3">${escapeHtml(q.timeIn)}</td>
        <td class="px-4 py-3 text-right">${actions}</td>
      </tr>
    `;
  }).join('');
}

function goConsult(vid) {
  showView('consultation');
  setTimeout(() => {
    const sel = document.getElementById('consult-patient-select');
    if (sel) {
      sel.value = vid;
      loadConsultation();
    }
  }, 60);
}
function goDisp(vid) {
  showView('dispensary');
  setTimeout(() => {
    const sel = document.getElementById('disp-patient-select');
    if (sel) {
      sel.value = vid;
      loadDispensary();
    }
  }, 60);
}
function goPay(vid) {
  showView('payment');
  setTimeout(() => {
    const sel = document.getElementById('pay-patient-select');
    if (sel) {
      sel.value = vid;
      loadPayment();
    }
  }, 60);
}

/* ========== CONSULTATION ========== */
function populateConsultSelect() {
  const queue = load('queue', []);
  const sel = document.getElementById('consult-patient-select');
  if (!sel) return;
  const eligible = queue.filter(q => ['REG', 'FCON'].includes(q.status));
  sel.innerHTML = '<option value="">— Select patient (status REG / FCON) —</option>' +
    eligible.map(q => `<option value="${escapeHtml(q.id)}">${escapeHtml(q.name)} (${escapeHtml(q.status)})</option>`).join('');
}

function loadConsultation() {
  const vid = document.getElementById('consult-patient-select')?.value;
  const empty = document.getElementById('consult-empty');
  const ws = document.getElementById('consult-workspace');
  if (!vid) {
    empty?.classList.remove('hidden');
    ws?.classList.add('hidden');
    currentVisit = null;
    orderedItems = [];
    return;
  }
  const queue = load('queue', []);
  currentVisit = queue.find(q => q.id === vid) || null;
  if (!currentVisit) {
    toast('Visit not found', true);
    return;
  }
  empty?.classList.add('hidden');
  ws?.classList.remove('hidden');

  const patients = load('patients', []);
  const p = patients.find(x => x.id === currentVisit.patientId) || {};
  safeText(document.getElementById('c-name'), currentVisit.name);
  safeText(document.getElementById('c-ic'), currentVisit.ic);
  safeText(document.getElementById('c-age'), `${calcAge(p.dob)} / ${p.gender || '—'}`);
  safeText(document.getElementById('c-payment'), p.type || 'Cash');
  const allergyEl = document.getElementById('c-allergy');
  if (allergyEl) {
    allergyEl.textContent = p.allergy || 'None recorded';
    allergyEl.className = p.allergy ? 'font-medium text-rose-600' : 'font-medium text-slate-600';
  }
  const notes = document.getElementById('c-notes');
  if (notes) notes.value = currentVisit.notes || '';
  const summary = document.getElementById('c-summary');
  if (summary) summary.value = currentVisit.summary || '';
  const fee = document.getElementById('c-fee');
  if (fee) fee.value = currentVisit.consultFee ?? 30;

  orderedItems = Array.isArray(currentVisit.items) ? currentVisit.items.map(i => ({ ...i })) : [];
  renderDrugList();
  renderOrdered();
  renderVisitHistory(currentVisit.patientId);
  renderRegimeQuickApply();
}

function renderRegimeQuickApply() {
  const el = document.getElementById('regime-quick-list');
  if (!el) return;
  const regimes = load('regimes', []);
  if (!regimes.length) {
    el.innerHTML = '<p class="text-slate-400">No regimes set up</p>';
    return;
  }
  el.innerHTML = regimes.map(r => `
    <button type="button" onclick="applyRegime('${escapeHtml(String(r.id))}')"
      class="w-full text-left px-2 py-1.5 rounded border border-slate-200 hover:bg-primary-50 hover:border-primary-300 transition">
      <i class="fas fa-layer-group text-primary-500 mr-1"></i>${escapeHtml(r.name)}
      <span class="text-slate-400">(${(r.items || []).length})</span>
    </button>
  `).join('');
}

function renderDrugList() {
  const drugs = load('drugs', []);
  const q = (document.getElementById('drug-search')?.value || '').toLowerCase().trim();
  const list = document.getElementById('drug-list');
  if (!list) return;

  const filtered = drugs.filter(d => {
    if (!q) return true;
    const desc = (d.desc || '').toLowerCase();
    const code = (d.code || '').toLowerCase();
    if (q.includes('%')) {
      const term = q.replace(/%/g, '');
      return desc.includes(term) || code.includes(term);
    }
    return desc.startsWith(q) || code.startsWith(q);
  });

  list.innerHTML = filtered.length
    ? filtered.map(d => {
        const low = d.bal <= d.reorder && d.bal < 999;
        return `
          <button type="button" onclick="addDrug('${escapeHtml(d.code)}')" class="w-full text-left px-2 py-1.5 rounded hover:bg-primary-50 text-xs flex justify-between gap-2 ${low ? 'bg-rose-50' : ''}">
            <span class="truncate"><span class="font-mono text-slate-400">${escapeHtml(d.code)}</span> ${escapeHtml(d.desc)}${low ? ' <span class="text-rose-600">(low)</span>' : ''}</span>
            <span class="text-slate-500 shrink-0">${money(d.price)}</span>
          </button>`;
      }).join('')
    : '<p class="text-xs text-slate-400 px-2">No matches</p>';
}

function filterDrugs() {
  renderDrugList();
}

function checkAllergyConflict(drugDesc, patientAllergy) {
  if (!patientAllergy || !drugDesc) return false;
  const allergy = String(patientAllergy).toLowerCase();
  const desc = String(drugDesc).toLowerCase();
  // Common keyword matches for clinic demo
  const tokens = allergy.split(/[,;/]+/).map(t => t.trim()).filter(t => t.length > 2);
  return tokens.some(t => desc.includes(t) || t.includes(desc.slice(0, 8)));
}

function addDrug(code) {
  try {
    const drugs = load('drugs', []);
    const d = drugs.find(x => x.code === code);
    if (!d) {
      toast('Drug not found', true);
      return;
    }
    if (d.bal < 999 && d.bal <= 0) {
      toast('This item is out of stock', true);
      return;
    }
    // Allergy check against current visit patient
    if (currentVisit) {
      const patients = load('patients', []);
      const p = patients.find(x => x.id === currentVisit.patientId);
      if (p && p.allergy && checkAllergyConflict(d.desc + ' ' + d.code, p.allergy)) {
        if (!confirm('⚠ ALLERGY ALERT\n\nPatient allergy: ' + p.allergy + '\nDrug: ' + d.desc + '\n\nAdd anyway?')) {
          toast('Drug not added (allergy caution)', true);
          return;
        }
      }
    }
    const existing = orderedItems.find(i => i.code === code);
    if (existing) {
      existing.qty = clampNumber(existing.qty + 1, 1, 9999);
    } else {
      orderedItems.push({
        code: d.code,
        desc: d.desc,
        qty: 1,
        uom: d.uom,
        price: d.price,
        dosage: d.uom === 'TAB' || d.uom === 'CAP' ? '1 TABLET' : 'AS DIRECTED',
        freq: 'TDS',
        instruction: 'AFTER MEAL'
      });
    }
    renderOrdered();
    toast(d.desc + ' added');
  } catch (e) {
    console.error('[CliniSYS] addDrug', e);
    toast('Could not add drug', true);
  }
}

function renderOrdered() {
  const list = document.getElementById('ordered-list');
  const empty = document.getElementById('ordered-empty');
  if (!list) return;
  if (!orderedItems.length) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  list.innerHTML = orderedItems.map((it, idx) => `
    <div class="flex items-start justify-between gap-2 text-xs bg-slate-50 rounded px-2 py-1.5">
      <div class="min-w-0 flex-1">
        <p class="font-medium truncate">${escapeHtml(it.desc)}</p>
        <div class="flex flex-wrap gap-2 mt-1 items-center text-slate-500">
          <label>Qty <input type="number" min="1" max="999" value="${it.qty}" class="w-14 border rounded px-1 py-0.5 text-xs" onchange="updateOrderedQty(${idx}, this.value)" /></label>
          <span>× ${money(it.price)}</span>
          <span>· ${escapeHtml(it.dosage)} · ${escapeHtml(it.freq)}</span>
        </div>
      </div>
      <button type="button" onclick="removeOrdered(${idx})" class="text-rose-500 hover:text-rose-700 shrink-0 p-1" title="Remove"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
}

function updateOrderedQty(idx, val) {
  if (!orderedItems[idx]) return;
  orderedItems[idx].qty = clampNumber(val, 1, 9999);
  renderOrdered();
}

function removeOrdered(idx) {
  orderedItems.splice(idx, 1);
  renderOrdered();
}

function applyRegime(regimeId) {
  const regimes = load('regimes', []);
  const r = regimes.find(x => String(x.id) === String(regimeId));
  if (!r || !Array.isArray(r.items)) {
    toast('Regime not found', true);
    return;
  }
  let added = 0;
  r.items.forEach(code => {
    const drugs = load('drugs', []);
    const d = drugs.find(x => x.code === code);
    if (!d) return;
    if (d.bal < 999 && d.bal <= 0) return;
    const existing = orderedItems.find(i => i.code === code);
    if (existing) {
      existing.qty = clampNumber(existing.qty + 1, 1, 9999);
    } else {
      orderedItems.push({
        code: d.code,
        desc: d.desc,
        qty: 1,
        uom: d.uom,
        price: d.price,
        dosage: (d.uom === 'TAB' || d.uom === 'CAP') ? '1 TABLET' : 'AS DIRECTED',
        freq: 'TDS',
        instruction: 'AFTER MEAL'
      });
    }
    added++;
  });
  renderOrdered();
  toast(added ? `Regime “${r.name}” applied (${added} item(s))` : 'No items could be added from this regime');
}

function renderVisitHistory(patientId) {
  const queue = load('queue', []);
  const history = queue.filter(q => q.patientId === patientId && q.status === 'DONE').slice(-5);
  const el = document.getElementById('visit-history');
  if (!el) return;
  el.innerHTML = history.length
    ? history.map(h => `
        <div class="flex justify-between border-b border-slate-100 pb-1">
          <span>${escapeHtml(h.date)} ${escapeHtml(h.timeIn)}</span>
          <span class="text-slate-400">${escapeHtml(h.reason)}</span>
        </div>`).join('')
    : '<p class="text-slate-400">No previous visits</p>';
}

function completeConsultation() {
  if (!currentVisit) {
    toast('No patient selected', true);
    return;
  }
  const notes = document.getElementById('c-notes')?.value || '';
  const summary = document.getElementById('c-summary')?.value || '';
  if (!notes.trim() && !orderedItems.length) {
    if (!confirm('No notes and no prescription yet.\nComplete consultation anyway?')) return;
  } else if (!notes.trim()) {
    if (!confirm('Consultation notes are empty.\nComplete anyway?')) return;
  } else if (!confirm('Complete consultation and send patient to Dispensary?')) {
    return;
  }
  const fee = clampNumber(document.getElementById('c-fee')?.value, 0, 99999);
  const medTotal = orderedItems.reduce((s, i) => s + i.qty * i.price, 0);

  const queue = load('queue', []);
  const idx = queue.findIndex(q => q.id === currentVisit.id);
  if (idx < 0) {
    toast('Visit no longer exists', true);
    return;
  }
  queue[idx].notes = notes;
  queue[idx].summary = summary;
  queue[idx].items = orderedItems.map(i => ({ ...i }));
  queue[idx].consultFee = fee;
  queue[idx].medTotal = medTotal;
  queue[idx].status = 'FCON';
  const completedId = queue[idx].id;
  saveChecked('queue', queue);
  toast('Consultation completed → sent to Dispensary');
  currentVisit = null;
  orderedItems = [];
  showView('dispensary');
  // Auto-select this patient in dispensary
  setTimeout(() => {
    const sel = document.getElementById('disp-patient-select');
    if (sel) {
      sel.value = completedId;
      loadDispensary();
    }
  }, 80);
  refreshStats();
}

/* ========== DISPENSARY ========== */
function populateDispSelect() {
  const queue = load('queue', []);
  const sel = document.getElementById('disp-patient-select');
  if (!sel) return;
  const eligible = queue.filter(q => q.status === 'FCON');
  sel.innerHTML = '<option value="">— Select patient (status FCON) —</option>' +
    eligible.map(q => `<option value="${escapeHtml(q.id)}">${escapeHtml(q.name)}</option>`).join('');
}

function loadDispensary() {
  const vid = document.getElementById('disp-patient-select')?.value;
  const empty = document.getElementById('disp-empty');
  const ws = document.getElementById('disp-workspace');
  if (!vid) {
    empty?.classList.remove('hidden');
    ws?.classList.add('hidden');
    window._currentDispVisit = null;
    return;
  }
  const queue = load('queue', []);
  const visit = queue.find(q => q.id === vid);
  if (!visit) {
    toast('Visit not found', true);
    return;
  }
  empty?.classList.add('hidden');
  ws?.classList.remove('hidden');
  safeText(document.getElementById('d-name'), visit.name);
  safeText(document.getElementById('d-ic'), visit.ic);
  const body = document.getElementById('disp-items-body');
  const items = visit.items || [];
  if (body) {
    body.innerHTML = items.length
      ? items.map(it => `
          <tr>
            <td class="px-3 py-2 font-mono text-xs">${escapeHtml(it.code)}</td>
            <td class="px-3 py-2">${escapeHtml(it.desc)}</td>
            <td class="px-3 py-2">${it.qty} ${escapeHtml(it.uom)}</td>
            <td class="px-3 py-2">${escapeHtml(it.dosage)}</td>
            <td class="px-3 py-2">${escapeHtml(it.freq)}</td>
            <td class="px-3 py-2 text-right">${money(it.price)}</td>
            <td class="px-3 py-2 text-right font-medium">${money(it.qty * it.price)}</td>
          </tr>`).join('')
      : '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-400">No medication ordered</td></tr>';
  }
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  safeText(document.getElementById('disp-total'), money(total));
  window._currentDispVisit = visit;
}

function printDrugLabels() {
  if (!window._currentDispVisit) {
    toast('Select a patient first', true);
    return;
  }
  const items = window._currentDispVisit.items || [];
  if (!items.length) {
    toast('No items to print labels for', true);
    return;
  }
  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) {
    toast('Pop-up blocked. Allow pop-ups to print labels.', true);
    return;
  }
  const labels = items.map(it => `
    <div style="border:1px dashed #999;padding:12px;margin-bottom:12px;font-family:sans-serif;font-size:12px">
      <strong>CliniSYS GP Clinic</strong><br>
      ${escapeHtml(window._currentDispVisit.name)} &nbsp; ${escapeHtml(window._currentDispVisit.ic)}<br>
      <hr style="border:none;border-top:1px solid #ccc;margin:6px 0">
      <strong>${escapeHtml(it.desc)}</strong><br>
      Qty: ${it.qty} ${escapeHtml(it.uom)} &nbsp; ${escapeHtml(it.dosage)} &nbsp; ${escapeHtml(it.freq)}<br>
      ${escapeHtml(it.instruction || '')}
    </div>`).join('');
  win.document.write(`<html><head><title>Drug Labels</title></head><body>${labels}<script>window.print()</script></body></html>`);
  win.document.close();
}

function completeDispensary() {
  if (!window._currentDispVisit) {
    toast('Select a patient first', true);
    return;
  }
  if (!confirm('Mark dispensary as completed and move to Payment?')) return;

  const queue = load('queue', []);
  const idx = queue.findIndex(q => q.id === window._currentDispVisit.id);
  if (idx < 0) {
    toast('Visit no longer exists', true);
    return;
  }
  // Deduct stock safely
  const drugs = load('drugs', []);
  (queue[idx].items || []).forEach(it => {
    const d = drugs.find(x => x.code === it.code);
    if (d && d.bal < 999) {
      d.bal = Math.max(0, d.bal - clampNumber(it.qty, 0));
    }
  });
  saveChecked('drugs', drugs);
  const completedId = queue[idx].id;
  queue[idx].status = 'FDIS';
  saveChecked('queue', queue);
  toast('Dispensary completed → ready for Payment');
  window._currentDispVisit = null;
  showView('payment');
  setTimeout(() => {
    const sel = document.getElementById('pay-patient-select');
    if (sel) {
      sel.value = completedId;
      loadPayment();
    }
  }, 80);
  refreshStats();
}

/* ========== PAYMENT ========== */
function populatePaySelect() {
  const queue = load('queue', []);
  const sel = document.getElementById('pay-patient-select');
  if (!sel) return;
  const eligible = queue.filter(q => q.status === 'FDIS');
  sel.innerHTML = '<option value="">— Select patient (status FDIS) —</option>' +
    eligible.map(q => `<option value="${escapeHtml(q.id)}">${escapeHtml(q.name)}</option>`).join('');
}

function loadPayment() {
  const vid = document.getElementById('pay-patient-select')?.value;
  const empty = document.getElementById('pay-empty');
  const ws = document.getElementById('pay-workspace');
  if (!vid) {
    empty?.classList.remove('hidden');
    ws?.classList.add('hidden');
    window._currentPayVisit = null;
    return;
  }
  const queue = load('queue', []);
  const visit = queue.find(q => q.id === vid);
  if (!visit) {
    toast('Visit not found', true);
    return;
  }
  empty?.classList.add('hidden');
  ws?.classList.remove('hidden');
  safeText(document.getElementById('p-name'), visit.name);
  safeText(document.getElementById('p-ic'), visit.ic);
  safeText(document.getElementById('p-consult'), money(visit.consultFee));
  safeText(document.getElementById('p-med'), money(visit.medTotal));
  safeText(document.getElementById('p-other'), money(0));
  const total = (Number(visit.consultFee) || 0) + (Number(visit.medTotal) || 0);
  safeText(document.getElementById('p-total'), money(total));
  const recv = document.getElementById('pay-received');
  if (recv) recv.value = total.toFixed(2);
  window._currentPayVisit = visit;
}

function confirmPayment() {
  if (!window._currentPayVisit) {
    toast('Select a patient first', true);
    return;
  }
  const received = clampNumber(document.getElementById('pay-received')?.value, 0);
  const total = (Number(window._currentPayVisit.consultFee) || 0) + (Number(window._currentPayVisit.medTotal) || 0);
  if (received < total - 0.01) {
    if (!confirm(`Received amount (${money(received)}) is less than total (${money(total)}).\nContinue anyway?`)) return;
  }
  if (!confirm('Confirm payment received and close this visit?')) return;

  const queue = load('queue', []);
  const idx = queue.findIndex(q => q.id === window._currentPayVisit.id);
  if (idx < 0) {
    toast('Visit no longer exists', true);
    return;
  }
  const visitSnapshot = { ...queue[idx] };
  queue[idx].status = 'DONE';
  queue[idx].paidAt = nowTime();
  queue[idx].receivedAmount = received;
  queue[idx].paymentMethod = document.getElementById('pay-method')?.value || 'Cash';
  saveChecked('queue', queue);
  toast('Payment received. Visit closed.');
  try {
    printReceipt({ ...visitSnapshot, receivedAmount: received, paymentMethod: queue[idx].paymentMethod, paidAt: queue[idx].paidAt });
  } catch (e) {
    console.warn('[CliniSYS] receipt', e);
  }
  window._currentPayVisit = null;
  showView('queue');
  refreshStats();
}

function printReceipt(visit) {
  try {
    const clinic = load('clinic', typeof DEFAULT_CLINIC !== 'undefined' ? DEFAULT_CLINIC : { name: 'Clinic', address: '', phone: '' });
    const total = (Number(visit.consultFee) || 0) + (Number(visit.medTotal) || 0);
    const items = (visit.items || []).map(it =>
      `<tr><td>${escapeHtml(it.desc)}</td><td style="text-align:right">${it.qty}</td><td style="text-align:right">${money(it.qty * it.price)}</td></tr>`
    ).join('');
    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) {
      toast('Allow pop-ups to print receipt', true);
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
      <style>
        body{font-family:system-ui,sans-serif;font-size:13px;padding:16px;max-width:320px;margin:0 auto}
        h1{font-size:16px;margin:0 0 4px;text-align:center}
        .sub{text-align:center;color:#555;font-size:11px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;margin:8px 0}
        td{padding:3px 0;border-bottom:1px dotted #ddd}
        .tot{font-weight:700;font-size:14px}
        .foot{margin-top:16px;text-align:center;font-size:11px;color:#666}
      </style></head><body>
      <h1>${escapeHtml(clinic.name || 'Clinic')}</h1>
      <div class="sub">${escapeHtml(clinic.address || '')}<br>${escapeHtml(clinic.phone || '')}</div>
      <div><strong>${escapeHtml(visit.name)}</strong><br>IC: ${escapeHtml(visit.ic)}<br>
      ${escapeHtml(visit.date || '')} ${escapeHtml(visit.paidAt || visit.timeIn || '')}<br>
      Method: ${escapeHtml(visit.paymentMethod || 'Cash')}</div>
      <table>
        <tr><td>Consultation</td><td></td><td style="text-align:right">${money(visit.consultFee)}</td></tr>
        ${items}
        <tr class="tot"><td>Total</td><td></td><td style="text-align:right">${money(total)}</td></tr>
        <tr><td>Received</td><td></td><td style="text-align:right">${money(visit.receivedAmount)}</td></tr>
      </table>
      <div class="foot">Thank you · Get well soon<br>Receipt #${escapeHtml(visit.id || '')}</div>
      <script>window.print()<\/script>
      </body></html>`);
    win.document.close();
  } catch (e) {
    console.error('[CliniSYS] printReceipt', e);
  }
}

function exportPatientsCSV() {
  try {
    const patients = load('patients', []);
    if (!patients.length) {
      toast('No patients to export', true);
      return;
    }
    const headers = ['id', 'name', 'ic', 'type', 'gender', 'dob', 'phone', 'allergy', 'panel', 'address', 'created'];
    const rows = patients.map(p => headers.map(h => {
      const v = p[h] == null ? '' : String(p[h]);
      return '"' + v.replace(/"/g, '""') + '"';
    }).join(','));
    const csv = headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patients-' + today() + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Patients exported to CSV');
  } catch (e) {
    console.error(e);
    toast('Export failed', true);
  }
}

/* ========== MC ========== */
function populateMCSelect() {
  const patients = load('patients', []);
  const sel = document.getElementById('mc-patient');
  if (!sel) return;
  sel.innerHTML = patients.length
    ? patients.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.ic)})</option>`).join('')
    : '<option value="">No patients</option>';
  const from = document.getElementById('mc-from');
  const to = document.getElementById('mc-to');
  if (from) from.value = today();
  if (to) to.value = today();
}

function printMC() {
  const patients = load('patients', []);
  const pid = document.getElementById('mc-patient')?.value;
  const p = patients.find(x => x.id === pid);
  if (!p) {
    toast('Select a patient', true);
    return;
  }
  const from = document.getElementById('mc-from')?.value || today();
  const to = document.getElementById('mc-to')?.value || today();
  const days = clampNumber(document.getElementById('mc-days')?.value, 1, 365);
  const diag = (document.getElementById('mc-diag')?.value || '—').trim();
  const doctor = (document.getElementById('mc-doctor')?.value || 'DR HENRY TAN').trim();

  const win = window.open('', '_blank', 'width=700,height=600');
  if (!win) {
    toast('Pop-up blocked. Allow pop-ups to print MC.', true);
    return;
  }
  win.document.write(`
    <html><head><title>Medical Certificate</title>
    <style>
      body{font-family:Georgia,serif;padding:40px;max-width:600px;margin:0 auto;color:#111}
      h1{text-align:center;font-size:22px;letter-spacing:2px;margin-bottom:8px}
      .clinic{text-align:center;color:#555;font-size:13px;margin-bottom:30px}
      .row{margin:12px 0}
      .label{color:#666;font-size:13px}
      .sig{margin-top:60px;display:flex;justify-content:space-between}
      .line{border-top:1px solid #333;width:180px;text-align:center;padding-top:4px;font-size:13px}
    </style></head><body>
    <div class="clinic">CliniSYS GP Clinic · MedexOne Global</div>
    <h1>MEDICAL CERTIFICATE</h1>
    <div class="row"><span class="label">This is to certify that</span><br><strong>${escapeHtml(p.name)}</strong> (IC: ${escapeHtml(p.ic)})</div>
    <div class="row"><span class="label">was examined and found to be unfit for duty for</span> <strong>${days} day(s)</strong></div>
    <div class="row"><span class="label">From</span> <strong>${escapeHtml(from)}</strong> <span class="label">to</span> <strong>${escapeHtml(to)}</strong></div>
    <div class="row"><span class="label">Diagnosis / Complaints:</span> ${escapeHtml(diag)}</div>
    <div class="sig">
      <div class="line">Date: ${escapeHtml(today())}</div>
      <div class="line">${escapeHtml(doctor)}<br>Doctor</div>
    </div>
    <script>window.print()</script>
    </body></html>
  `);
  win.document.close();
}

/* ========== STOCK ========== */
function renderStockTable() {
  const drugs = load('drugs', []);
  const q = (document.getElementById('stock-search')?.value || '').toLowerCase().trim();
  const tbody = document.getElementById('stock-table-body');
  if (!tbody) return;
  const filtered = drugs.filter(d =>
    !q || (d.code || '').toLowerCase().includes(q) || (d.desc || '').toLowerCase().includes(q)
  );
  tbody.innerHTML = filtered.length
    ? filtered.map(d => {
        const low = d.bal <= d.reorder && d.bal < 999;
        return `
          <tr class="${low ? 'bg-rose-50' : ''}">
            <td class="px-4 py-3 font-mono text-xs">${escapeHtml(d.code)}</td>
            <td class="px-4 py-3">${escapeHtml(d.desc)}</td>
            <td class="px-4 py-3">${escapeHtml(d.uom)}</td>
            <td class="px-4 py-3 text-right ${low ? 'text-rose-600 font-semibold' : ''}">${d.bal}${low ? ' ⚠' : ''}</td>
            <td class="px-4 py-3 text-right">${money(d.price)}</td>
            <td class="px-4 py-3">${d.reorder}</td>
            <td class="px-4 py-3 text-right">
              <button onclick="openStockModal('${escapeHtml(d.code)}')" class="text-primary-600 text-xs hover:underline">Edit</button>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">No stock items</td></tr>';
}

function openStockModal(code = null) {
  const drugs = load('drugs', []);
  const d = code ? drugs.find(x => x.code === code) : null;
  const content = `
    <div class="p-6">
      <div class="flex justify-between mb-4">
        <h2 class="text-lg font-bold">${d ? 'Edit Stock' : 'Add Stock Item'}</h2>
        <button onclick="closeModal()" class="text-slate-400" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-slate-500">Code *</label><input id="s-code" value="${escapeHtml(d?.code || '')}" ${d ? 'readonly' : ''} maxlength="20" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm ${d ? 'bg-slate-50' : ''}" /></div>
          <div><label class="text-xs text-slate-500">UOM</label><input id="s-uom" value="${escapeHtml(d?.uom || 'TAB')}" maxlength="10" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div><label class="text-xs text-slate-500">Description *</label><input id="s-desc" value="${escapeHtml(d?.desc || '')}" maxlength="120" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" /></div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="text-xs text-slate-500">Balance</label><input id="s-bal" type="number" min="0" value="${d?.bal ?? 0}" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label class="text-xs text-slate-500">Unit Price</label><input id="s-price" type="number" step="0.01" min="0" value="${d?.price ?? 0}" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label class="text-xs text-slate-500">Reorder Level</label><input id="s-reorder" type="number" min="0" value="${d?.reorder ?? 10}" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <button onclick="saveStock('${escapeHtml(code || '')}')" class="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium mt-2">Save</button>
      </div>
    </div>
  `;
  openModal(content);
}

function saveStock(code) {
  const drugs = load('drugs', []);
  const data = {
    code: (document.getElementById('s-code')?.value || '').trim().toUpperCase(),
    desc: (document.getElementById('s-desc')?.value || '').trim(),
    uom: (document.getElementById('s-uom')?.value || 'TAB').trim(),
    bal: clampNumber(document.getElementById('s-bal')?.value, 0),
    price: clampNumber(document.getElementById('s-price')?.value, 0),
    reorder: clampNumber(document.getElementById('s-reorder')?.value, 0)
  };
  if (!data.code || !data.desc) {
    toast('Code and description required', true);
    return;
  }
  if (code) {
    const idx = drugs.findIndex(d => d.code === code);
    if (idx >= 0) drugs[idx] = data;
  } else {
    if (drugs.some(d => d.code === data.code)) {
      toast('Code already exists', true);
      return;
    }
    drugs.push(data);
  }
  saveChecked('drugs', drugs);
  closeModal();
  renderStockTable();
  refreshStats();
  toast('Stock saved');
}

/* ========== SUPPLIER ========== */
function renderSupplierTable() {
  const list = load('suppliers', []);
  const tbody = document.getElementById('supplier-table-body');
  if (!tbody) return;
  tbody.innerHTML = list.length
    ? list.map(s => `
        <tr>
          <td class="px-4 py-3 font-mono text-xs">${escapeHtml(s.code)}</td>
          <td class="px-4 py-3 font-medium">${escapeHtml(s.name)}</td>
          <td class="px-4 py-3">${escapeHtml(s.contact)}</td>
          <td class="px-4 py-3">${escapeHtml(s.phone)}</td>
          <td class="px-4 py-3 text-right"><button onclick="openSupplierModal('${escapeHtml(s.code)}')" class="text-primary-600 text-xs hover:underline">Edit</button></td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">No suppliers</td></tr>';
}

function openSupplierModal(code = null) {
  const list = load('suppliers', []);
  const s = code ? list.find(x => x.code === code) : null;
  openModal(`
    <div class="p-6">
      <div class="flex justify-between mb-4"><h2 class="text-lg font-bold">${s ? 'Edit' : 'Add'} Supplier</h2><button onclick="closeModal()" class="text-slate-400"><i class="fas fa-times"></i></button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-slate-500">Code</label><input id="sup-code" value="${escapeHtml(s?.code || '')}" ${s ? 'readonly' : ''} maxlength="20" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm ${s ? 'bg-slate-50' : ''}" /></div>
        <div><label class="text-xs text-slate-500">Name</label><input id="sup-name" value="${escapeHtml(s?.name || '')}" maxlength="100" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-slate-500">Contact</label><input id="sup-contact" value="${escapeHtml(s?.contact || '')}" maxlength="50" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label class="text-xs text-slate-500">Phone</label><input id="sup-phone" value="${escapeHtml(s?.phone || '')}" maxlength="30" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <button onclick="saveSupplier('${escapeHtml(code || '')}')" class="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium">Save</button>
      </div>
    </div>
  `);
}

function saveSupplier(code) {
  const list = load('suppliers', []);
  const data = {
    code: (document.getElementById('sup-code')?.value || '').trim().toUpperCase(),
    name: (document.getElementById('sup-name')?.value || '').trim(),
    contact: (document.getElementById('sup-contact')?.value || '').trim(),
    phone: (document.getElementById('sup-phone')?.value || '').trim()
  };
  if (!data.code || !data.name) {
    toast('Code and name required', true);
    return;
  }
  if (code) {
    const idx = list.findIndex(s => s.code === code);
    if (idx >= 0) list[idx] = data;
  } else {
    if (list.some(s => s.code === data.code)) {
      toast('Code exists', true);
      return;
    }
    list.push(data);
  }
  saveChecked('suppliers', list);
  closeModal();
  renderSupplierTable();
  toast('Supplier saved');
}

/* ========== REGIME ========== */
function renderRegimes() {
  const regimes = load('regimes', []);
  const drugs = load('drugs', []);
  const el = document.getElementById('regime-cards');
  if (!el) return;
  el.innerHTML = regimes.map(r => {
    const names = (r.items || []).map(c => drugs.find(d => d.code === c)?.desc || c).join(', ');
    return `
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800">${escapeHtml(r.name)}</h3>
        <p class="text-xs text-slate-500 mt-2 line-clamp-2">${escapeHtml(names)}</p>
        <p class="text-xs text-slate-400 mt-2">${(r.items || []).length} item(s)</p>
      </div>`;
  }).join('') || '<p class="text-slate-400 col-span-full">No regimes yet</p>';
}

function openRegimeModal() {
  const drugs = load('drugs', []);
  openModal(`
    <div class="p-6">
      <div class="flex justify-between mb-4"><h2 class="text-lg font-bold">New Regime Group</h2><button onclick="closeModal()" class="text-slate-400"><i class="fas fa-times"></i></button></div>
      <div class="space-y-3">
        <div><label class="text-xs text-slate-500">Name</label><input id="rg-name" maxlength="60" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" placeholder="e.g. ACUTE SINUSITIS" /></div>
        <div><label class="text-xs text-slate-500">Select drugs (Ctrl/Cmd + click for multi)</label>
          <select id="rg-items" multiple class="w-full mt-1 border rounded-lg px-3 py-2 text-sm h-40">
            ${drugs.map(d => `<option value="${escapeHtml(d.code)}">${escapeHtml(d.code)} – ${escapeHtml(d.desc)}</option>`).join('')}
          </select>
        </div>
        <button onclick="saveRegime()" class="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium">Save Regime</button>
      </div>
    </div>
  `);
}

function saveRegime() {
  const name = (document.getElementById('rg-name')?.value || '').trim();
  const sel = document.getElementById('rg-items');
  const items = sel ? Array.from(sel.selectedOptions).map(o => o.value) : [];
  if (!name || !items.length) {
    toast('Name and at least one drug required', true);
    return;
  }
  const regimes = load('regimes', []);
  regimes.push({ id: Date.now(), name, items });
  saveChecked('regimes', regimes);
  closeModal();
  renderRegimes();
  toast('Regime created');
}

/* ========== PO & GOODS RECEIVE ========== */
function populatePOSelects() {
  const suppliers = load('suppliers', []);
  const drugs = load('drugs', []);
  const supSel = document.getElementById('po-supplier');
  const itemSel = document.getElementById('po-item');
  if (supSel) supSel.innerHTML = suppliers.map(s => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.name)}</option>`).join('') || '<option value="">No suppliers</option>';
  if (itemSel) itemSel.innerHTML = drugs.map(d => `<option value="${escapeHtml(d.code)}">${escapeHtml(d.code)} – ${escapeHtml(d.desc)}</option>`).join('') || '<option value="">No items</option>';
  const poDate = document.getElementById('po-date');
  if (poDate) poDate.value = today();
  const pos = load('pos', []);
  const listEl = document.getElementById('po-list');
  if (listEl) {
    listEl.innerHTML = pos.slice(-5).reverse().map(p => `
      <div class="flex justify-between text-xs border-b border-slate-100 py-1">
        <span>${escapeHtml(p.date)} · ${escapeHtml(p.supplier)} · ${escapeHtml(p.item)} × ${p.qty}</span>
        <span class="text-slate-500">${money(p.qty * p.cost)}</span>
      </div>`).join('') || '<p class="text-slate-400 text-xs">No recent POs</p>';
  }
}

function createPO() {
  const qty = clampNumber(document.getElementById('po-qty')?.value, 1);
  const cost = clampNumber(document.getElementById('po-cost')?.value, 0);
  const pos = load('pos', []);
  const po = {
    id: uid('PO'),
    supplier: document.getElementById('po-supplier')?.value || '',
    item: document.getElementById('po-item')?.value || '',
    qty,
    cost,
    date: document.getElementById('po-date')?.value || today()
  };
  if (!po.supplier || !po.item) {
    toast('Select supplier and item', true);
    return;
  }
  pos.push(po);
  saveChecked('pos', pos);
  toast('Purchase Order created');
  populatePOSelects();
}

function populateGRSelect() {
  const drugs = load('drugs', []);
  const sel = document.getElementById('gr-item');
  if (sel) {
    sel.innerHTML = drugs.map(d => `<option value="${escapeHtml(d.code)}">${escapeHtml(d.code)} – ${escapeHtml(d.desc)} (bal: ${d.bal})</option>`).join('') || '<option value="">No items</option>';
  }
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 2);
  const expEl = document.getElementById('gr-expiry');
  if (expEl) expEl.value = exp.toISOString().slice(0, 10);
}

function receiveGoods() {
  const code = document.getElementById('gr-item')?.value;
  const qty = clampNumber(document.getElementById('gr-qty')?.value, 1);
  if (!code) {
    toast('Select an item', true);
    return;
  }
  const drugs = load('drugs', []);
  const d = drugs.find(x => x.code === code);
  if (!d) {
    toast('Item not found', true);
    return;
  }
  d.bal = clampNumber(d.bal + qty, 0);
  saveChecked('drugs', drugs);
  toast(`Received ${qty} of ${d.desc}. New balance: ${d.bal}`);
  populateGRSelect();
  refreshStats();
}

/* ========== MODAL HELPERS ========== */
function openModal(html) {
  const content = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!content || !overlay) return;
  content.innerHTML = html;
  overlay.classList.remove('hidden');
  overlay.classList.add('show');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.classList.remove('show');
}

document.getElementById('modal-overlay')?.addEventListener('click', e => {
  if (e.target.id === 'modal-overlay') closeModal();
});
