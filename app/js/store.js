// Capa de datos: usa el `db` del artifact (sincronizado entre dispositivos y legible por Claude)
// y, si no está disponible (vista previa local), un respaldo en localStorage con la misma forma.
const { useState, useEffect } = window.htmPreact;

export const COLLECTIONS = ['exercises', 'sessions', 'measurements', 'nutrition'];
const PROFILE_PATH = 'profile/main';

const state = {
  mode: 'loading', // 'cloud' | 'local'
  exercises: [], sessions: [], measurements: [], nutrition: [],
  profile: null,
  loaded: {},
  canWrite: true,
  error: null,
};
const listeners = new Set();
const emit = () => { for (const l of listeners) l(); };

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    l(); // por si el estado cambió antes de suscribirse
    return () => listeners.delete(l);
  }, []);
  return state;
}
export const getState = () => state;

let db = null;
let assets = null;

/* ---------- respaldo local ---------- */
const LKEY = 'forus-log-local-v1';
function readLocal() { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch { return {}; } }
function writeLocal(obj) { try { localStorage.setItem(LKEY, JSON.stringify(obj)); } catch { /* sin almacenamiento */ } }
const local = {
  data: {},
  load() { this.data = readLocal(); },
  coll(name) { return Object.entries(this.data[name] || {}).map(([id, d]) => ({ id, ...d })); },
  set(name, id, d) { (this.data[name] ||= {})[id] = d; writeLocal(this.data); },
  del(name, id) { if (this.data[name]) delete this.data[name][id]; writeLocal(this.data); },
};

/* ---------- inicio ---------- */
export async function initStore() {
  const c = window.claude;
  try { db = c ? await c.use('db') : null; } catch { db = null; }
  try { assets = c ? await c.use('assets') : null; } catch { assets = null; }
  try {
    const user = c ? await c.use('user') : null;
    const can = user ? await user.can?.('data.write') : null;
    if (can === false) state.canWrite = false;
  } catch { /* sin datos de permisos */ }

  if (db) {
    state.mode = 'cloud';
    for (const name of COLLECTIONS) {
      db.collection(name).onSnapshot(
        (snap) => {
          state[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          state.loaded[name] = true;
          emit();
        },
        (e) => { state.error = e?.code || 'unavailable'; emit(); },
      );
    }
    db.doc(PROFILE_PATH).onSnapshot(
      (snap) => { state.profile = snap.exists ? snap.data() : {}; state.loaded.profile = true; emit(); },
      () => {},
    );
  } else {
    state.mode = 'local';
    local.load();
    for (const name of COLLECTIONS) { state[name] = local.coll(name); state.loaded[name] = true; }
    state.profile = local.data.profile?.main || {};
    state.loaded.profile = true;
  }
  emit();
}

/* ---------- escrituras: una a la vez por documento, la última gana ---------- */
const queues = new Map();
function enqueue(path, fn) {
  const q = queues.get(path) || { running: false, next: null };
  queues.set(path, q);
  q.next = fn;
  if (q.running) return q.promise;
  q.running = true;
  q.promise = (async () => {
    while (q.next) {
      const job = q.next; q.next = null;
      try { await job(); } catch (e) { state.error = e?.code || 'write_failed'; emit(); throw e; }
    }
    q.running = false;
  })();
  return q.promise;
}

const clean = (obj) => JSON.parse(JSON.stringify(obj)); // quita undefined y congelados

export function saveDoc(name, id, data) {
  const body = clean({ ...data, updatedAt: new Date().toISOString() });
  if (state.mode === 'local') {
    local.set(name, id, body);
    state[name] = local.coll(name);
    emit();
    return Promise.resolve();
  }
  return enqueue(`${name}/${id}`, () => db.collection(name).doc(id).set(body));
}

export function deleteDoc(name, id) {
  if (state.mode === 'local') {
    local.del(name, id);
    state[name] = local.coll(name);
    emit();
    return Promise.resolve();
  }
  return enqueue(`${name}/${id}`, () => db.collection(name).doc(id).delete());
}

export function saveProfile(data) {
  const body = clean({ ...data, updatedAt: new Date().toISOString() });
  if (state.mode === 'local') {
    local.data.profile = { main: body }; writeLocal(local.data);
    state.profile = body; emit();
    return Promise.resolve();
  }
  return enqueue(PROFILE_PATH, () => db.doc(PROFILE_PATH).set(body));
}

export function newId(prefix = 'x') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${t}${r}`;
}

/* ---------- imágenes (capturas, dibujos subidos) ---------- */
export const canUpload = () => !!assets;
export async function uploadImage(file) {
  if (!assets) throw { code: 'not_granted', message: 'Subida no disponible en esta vista' };
  const res = await assets.upload(file);
  return res.id;
}
export const assetUrl = (id) => (id ? `/_blob/${id}` : null);

// Imagen de un ejercicio: asset subido por ti, o dibujo publicado con la app.
export function exerciseImage(ex) {
  if (!ex) return null;
  if (ex.imageAsset) return assetUrl(ex.imageAsset);
  if (ex.image) return ex.image;
  return null;
}
