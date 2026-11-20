// Sample data & hardened LocalStorage helpers for CliniSYS GP demo

const DEFAULT_DRUGS = [
  { code: 'PARA500', desc: 'PARACETAMOL (POM) TAB. 500MG', uom: 'TAB', price: 0.25, bal: 500, reorder: 100 },
  { code: 'PARA250SY', desc: 'PARACETAMOL 250MG/5ML SYRUP', uom: 'BOT', price: 8.50, bal: 40, reorder: 10 },
  { code: 'CLOXA250', desc: 'CLOXACILLIN TAB. 250MG', uom: 'TAB', price: 0.45, bal: 300, reorder: 50 },
  { code: 'BENADRYL', desc: 'DIPHENHYDRAMINE (BENADRYL) SY', uom: 'BOT', price: 12.00, bal: 25, reorder: 5 },
  { code: 'ACTIFED', desc: 'TRIPROLIDINE+PSEUDOEPHEDRINE (ACTIFED) TAB', uom: 'TAB', price: 0.80, bal: 200, reorder: 40 },
  { code: 'AMOX250', desc: 'AMOXYCILLIN CAP. 250MG', uom: 'CAP', price: 0.55, bal: 400, reorder: 80 },
  { code: 'ECG', desc: 'ELECTROCARDIOGRAM', uom: 'SVC', price: 35.00, bal: 999, reorder: 0 },
  { code: 'DRESS1', desc: 'DRESSING - SIMPLE', uom: 'SVC', price: 15.00, bal: 999, reorder: 0 },
  { code: 'FBC', desc: 'FULL BLOOD COUNT', uom: 'SVC', price: 25.00, bal: 999, reorder: 0 },
  { code: 'ORALREH', desc: 'ORAL REHYDRATION SALTS', uom: 'SACH', price: 1.20, bal: 150, reorder: 30 }
];

const DEFAULT_SUPPLIERS = [
  { code: 'SUP001', name: 'PharmaCare Sdn Bhd', contact: 'Mr. Lim', phone: '03-1234 5678' },
  { code: 'SUP002', name: 'MediSupply Malaysia', contact: 'Ms. Wong', phone: '03-8765 4321' },
  { code: 'SUP003', name: 'Global Drug Distributors', contact: 'Mr. Raj', phone: '03-5555 1212' }
];

const DEFAULT_REGIMES = [
  { id: 1, name: 'URTI (COMMON)', items: ['PARA500', 'ACTIFED', 'BENADRYL'] },
  { id: 2, name: 'GASTRITIS', items: ['PARA500'] },
  { id: 3, name: 'ACUTE SINUSITIS', items: ['AMOX250', 'PARA500', 'ACTIFED'] },
  { id: 4, name: 'VIRAL FEVER', items: ['PARA500', 'PARA250SY'] },
  { id: 5, name: 'CHICKEN POX (CHILDREN)', items: ['PARA250SY', 'BENADRYL'] }
];

const DEFAULT_PATIENTS = [
  {
    id: 'P001',
    name: 'GOH JING SIN',
    ic: '891217015142',
    type: 'Cash',
    gender: 'Female',
    dob: '1989-12-17',
    phone: '012-3456789',
    address: 'Kuala Lumpur',
    allergy: '',
    panel: '',
    created: '2026-11-20'
  },
  {
    id: 'P002',
    name: 'AHMAD BIN HASSAN',
    ic: '850503105678',
    type: 'Panel',
    gender: 'Male',
    dob: '1985-05-03',
    phone: '013-9876543',
    address: 'Petaling Jaya',
    allergy: 'Penicillin',
    panel: 'MedexOne Global Sdn Bhd',
    created: '2026-11-19'
  }
];

/** Demo users – change passwords in real deployment */
const DEFAULT_USERS = [
  { id: 'admin', name: 'System Admin', password: 'admin', role: 'admin' },
  { id: 'doctor', name: 'Dr Henry Tan', password: 'doctor', role: 'doctor' },
  { id: 'nurse', name: 'Nurse Aisha', password: 'nurse', role: 'nurse' },
  { id: 'cashier', name: 'Cashier Lim', password: 'cashier', role: 'cashier' }
];

const DEFAULT_CLINIC = {
  name: 'CliniSYS GP Clinic',
  address: 'Petaling Jaya, Selangor',
  phone: '03-7803 5191',
  regNo: 'GP-DEMO-001'
};

/** Role → allowed views (admin sees all) */
const ROLE_VIEWS = {
  admin: null, // all
  doctor: ['dashboard', 'queue', 'consultation', 'mc', 'registration'],
  nurse: ['dashboard', 'registration', 'queue', 'dispensary', 'stock', 'mc'],
  cashier: ['dashboard', 'queue', 'payment', 'registration']
};

const STORAGE_PREFIX = 'clinisys_';

/** In-memory fallback if localStorage is unavailable or full */
const memoryStore = {};

function storageAvailable() {
  try {
    const k = '__clinisys_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const HAS_STORAGE = storageAvailable();

/**
 * Load JSON data safely. Never throws to the caller.
 * Returns fallback on missing, corrupt, or wrong-type data.
 */
function load(key, fallback) {
  try {
    let raw = null;
    if (HAS_STORAGE) {
      raw = localStorage.getItem(STORAGE_PREFIX + key);
    } else if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
      return structuredCloneSafe(memoryStore[key], fallback);
    }
    if (raw == null || raw === '') return cloneFallback(fallback);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.warn('[CliniSYS] Corrupt data for key:', key, parseErr);
      return cloneFallback(fallback);
    }

    // Type guard: if fallback is array, ensure array; if object, ensure object
    if (Array.isArray(fallback) && !Array.isArray(parsed)) {
      console.warn('[CliniSYS] Expected array for', key, '– using fallback');
      return cloneFallback(fallback);
    }
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback) &&
        (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
      console.warn('[CliniSYS] Expected object for', key, '– using fallback');
      return cloneFallback(fallback);
    }
    return parsed;
  } catch (err) {
    console.error('[CliniSYS] load failed:', key, err);
    return cloneFallback(fallback);
  }
}

/**
 * Save JSON data safely. Returns { ok, error? }.
 * Handles QuotaExceededError and private-mode failures.
 */
function save(key, data) {
  try {
    const json = JSON.stringify(data);
    if (HAS_STORAGE) {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, json);
      } catch (e) {
        // Quota exceeded or private browsing
        if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
          console.error('[CliniSYS] Storage full');
          memoryStore[key] = data;
          return { ok: false, error: 'STORAGE_FULL', message: 'Browser storage is full. Data kept in memory only for this session.' };
        }
        memoryStore[key] = data;
        return { ok: false, error: 'STORAGE_WRITE', message: 'Could not save to browser storage. Data kept in memory for this session.' };
      }
    } else {
      memoryStore[key] = data;
    }
    return { ok: true };
  } catch (err) {
    console.error('[CliniSYS] save failed:', key, err);
    try { memoryStore[key] = data; } catch (_) { /* ignore */ }
    return { ok: false, error: 'SAVE_FAILED', message: 'Failed to save data.' };
  }
}

function cloneFallback(fallback) {
  try {
    return structuredCloneSafe(fallback, fallback);
  } catch {
    return fallback;
  }
}

function structuredCloneSafe(value, fallback) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

/**
 * Initialize default datasets if missing or corrupted.
 * Returns { ok, repairedKeys[] }.
 */
function initData() {
  const repaired = [];
  const ensure = (key, defaultVal) => {
    try {
      const existing = HAS_STORAGE ? localStorage.getItem(STORAGE_PREFIX + key) : null;
      if (existing == null) {
        const r = save(key, defaultVal);
        if (!r.ok) repaired.push(key + ' (memory)');
        else repaired.push(key + ' (created)');
        return;
      }
      // Validate parse
      try {
        const parsed = JSON.parse(existing);
        if (Array.isArray(defaultVal) && !Array.isArray(parsed)) {
          save(key, defaultVal);
          repaired.push(key + ' (repaired)');
        }
      } catch {
        save(key, defaultVal);
        repaired.push(key + ' (repaired corrupt)');
      }
    } catch (e) {
      console.error('[CliniSYS] initData ensure failed:', key, e);
      save(key, defaultVal);
      repaired.push(key + ' (error recovery)');
    }
  };

  ensure('drugs', DEFAULT_DRUGS);
  ensure('suppliers', DEFAULT_SUPPLIERS);
  ensure('regimes', DEFAULT_REGIMES);
  ensure('patients', DEFAULT_PATIENTS);
  ensure('queue', []);
  ensure('visits', {});
  ensure('pos', []);
  ensure('users', DEFAULT_USERS);
  ensure('clinic', DEFAULT_CLINIC);

  return { ok: true, repaired };
}

function uid(prefix = 'ID') {
  try {
    const rand = (typeof crypto !== 'undefined' && crypto.getRandomValues)
      ? Array.from(crypto.getRandomValues(new Uint8Array(3))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 5).toUpperCase()
      : Math.random().toString(36).slice(2, 7).toUpperCase();
    return prefix + Date.now().toString(36).toUpperCase() + rand;
  } catch {
    return prefix + String(Date.now()) + Math.floor(Math.random() * 1000);
  }
}

function today() {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return '1970-01-01';
  }
}

function nowTime() {
  try {
    return new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function calcAge(dob) {
  try {
    if (!dob) return '—';
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return '—';
    const t = new Date();
    let age = t.getFullYear() - d.getFullYear();
    const m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
    if (age < 0 || age > 150) return '—';
    return age + ' yrs';
  } catch {
    return '—';
  }
}

function money(n) {
  try {
    const num = Number(n);
    if (!Number.isFinite(num)) return 'RM 0.00';
    return 'RM ' + num.toFixed(2);
  } catch {
    return 'RM 0.00';
  }
}

/**
 * Run a function and never let it crash the UI.
 * Returns { ok, result?, error? }.
 */
function safeRun(fn, label) {
  try {
    const result = fn();
    return { ok: true, result };
  } catch (err) {
    console.error('[CliniSYS] safeRun:', label || 'unknown', err);
    return { ok: false, error: err };
  }
}
