// Cálculos de progreso: series por músculo, 1RM estimado, récords, rachas.
import { MUSCLES, SECONDARY_WEIGHT } from './muscles.js';

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => dateKey(new Date());
export const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export function weekStart(d) { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x; }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const fmtDay = (k) => { const d = parseDay(k); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; };
export const fmtShort = (k) => { const d = parseDay(k); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
export const monthLabel = (k) => { const d = parseDay(k); return `${['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][d.getMonth()]} ${d.getFullYear()}`; };
export const DIAS_CORTOS = DIAS;
export const MESES_CORTOS = MESES;

export const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
export const fmtNum = (v, d = 1) => (v == null ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('es', { maximumFractionDigits: d }));

// Serie efectiva: tiene repeticiones registradas y el ejercicio no fue omitido.
export const isWorkSet = (s) => (num(s?.reps) ?? 0) > 0 || (num(s?.secs) ?? 0) > 0;
// Movilidad, estiramientos y cardio no suman series de fuerza al músculo.
export const countsForVolume = (it) => !['movilidad', 'cardio'].includes(it?.categoria);
export const fmtSet = (x) => (num(x.secs) ? `${num(x.secs)} s` : `${num(x.reps)}${num(x.weight) ? `×${fmtNum(num(x.weight))}` : ''}`);
export const activeItems = (session) => (session.items || []).filter((it) => it.status !== 'omitido');

export const completedSessions = (sessions) => sessions
  .filter((s) => s.status === 'guardada' || s.status === 'en_curso')
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// Epley ajustado por RIR: repeticiones posibles = reps + RIR.
export function e1rm(weight, reps, rir) {
  const w = num(weight); const r = num(reps); const x = num(rir) ?? 0;
  if (!w || !r) return null;
  return w * (1 + (r + Math.min(Math.max(x, 0), 5)) / 30);
}

export function setsByMuscle(sessions, from, to) {
  const out = Object.fromEntries(MUSCLES.map((m) => [m.id, 0]));
  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    for (const it of activeItems(s)) {
      if (!countsForVolume(it)) continue;
      const n = (it.sets || []).filter(isWorkSet).length;
      if (!n) continue;
      for (const m of it.primary || []) if (m in out) out[m] += n;
      for (const m of it.secondary || []) if (m in out) out[m] += n * SECONDARY_WEIGHT;
    }
  }
  return out;
}

export function weeklyMuscleSeries(sessions, muscle, weeks = 8) {
  const start = weekStart(new Date());
  const res = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(start, -7 * i);
    const from = dateKey(ws); const to = dateKey(addDays(ws, 6));
    res.push({ label: fmtShort(from), from, value: setsByMuscle(sessions, from, to)[muscle] || 0 });
  }
  return res;
}

export function sessionVolume(s) {
  let v = 0;
  for (const it of activeItems(s)) for (const set of it.sets || []) v += (num(set.weight) || 0) * (num(set.reps) || 0);
  return v;
}
export const sessionSetCount = (s) => activeItems(s).reduce((a, it) => a + (it.sets || []).filter(isWorkSet).length, 0);
export function sessionMuscles(s) {
  const c = {};
  for (const it of activeItems(s)) {
    const n = (it.sets || []).filter(isWorkSet).length;
    for (const m of it.primary || []) c[m] = (c[m] || 0) + n;
  }
  return Object.entries(c).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([m]) => m);
}
export function sessionChanges(s) {
  const items = s.items || [];
  return {
    omitidos: items.filter((i) => i.status === 'omitido').length,
    sustituidos: items.filter((i) => i.status === 'sustituido').length,
    agregados: items.filter((i) => i.origin === 'agregado').length,
  };
}

// Historial por ejercicio: mejor serie de cada sesión.
export function exerciseHistory(sessions, exerciseId) {
  const rows = [];
  for (const s of sessions) {
    for (const it of activeItems(s)) {
      if (it.exerciseId !== exerciseId) continue;
      let best = null;
      for (const set of it.sets || []) {
        const v = e1rm(set.weight, set.reps, set.rir);
        if (v && (!best || v > best.e1rm)) best = { e1rm: v, weight: num(set.weight), reps: num(set.reps), rir: num(set.rir) };
      }
      rows.push({ date: s.date, sessionId: s.id, sets: (it.sets || []).filter(isWorkSet), best });
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function lastPerformance(sessions, exerciseId, beforeDate, excludeSessionId) {
  const h = exerciseHistory(sessions.filter((s) => s.id !== excludeSessionId && s.date <= beforeDate), exerciseId)
    .filter((r) => r.sets.length);
  return h.length ? h[h.length - 1] : null;
}

// Cambio % del mejor 1RM estimado: últimas 4 semanas vs las 4 anteriores, por músculo principal.
export function muscleProgress(sessions, muscle) {
  const today = todayKey();
  const mid = dateKey(addDays(new Date(), -28));
  const start = dateKey(addDays(new Date(), -56));
  const byEx = {};
  for (const s of sessions) {
    if (s.date < start || s.date > today) continue;
    for (const it of activeItems(s)) {
      if (!(it.primary || []).includes(muscle)) continue;
      const e = (byEx[it.exerciseId] ||= { recent: 0, prev: 0 });
      for (const set of it.sets || []) {
        const v = e1rm(set.weight, set.reps, set.rir) || 0;
        if (s.date > mid) e.recent = Math.max(e.recent, v); else e.prev = Math.max(e.prev, v);
      }
    }
  }
  const changes = Object.values(byEx).filter((e) => e.recent && e.prev).map((e) => (e.recent - e.prev) / e.prev);
  if (!changes.length) return null;
  return changes.reduce((a, b) => a + b, 0) / changes.length;
}

export function recentPRs(sessions, limit = 6) {
  const asc = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const best = {}; const prs = [];
  for (const s of asc) {
    for (const it of activeItems(s)) {
      let top = null;
      for (const set of it.sets || []) {
        const v = e1rm(set.weight, set.reps, set.rir);
        if (v && (!top || v > top.v)) top = { v, set };
      }
      if (!top) continue;
      const prev = best[it.exerciseId];
      if (prev && top.v > prev * 1.005) prs.push({ date: s.date, name: it.name, exerciseId: it.exerciseId, e1rm: top.v, gain: (top.v - prev) / prev, set: top.set });
      best[it.exerciseId] = Math.max(prev || 0, top.v);
    }
  }
  return prs.reverse().slice(0, limit);
}

export function weekStreak(sessions) {
  const weeks = new Set(sessions.map((s) => dateKey(weekStart(parseDay(s.date)))));
  let n = 0; let w = weekStart(new Date());
  if (!weeks.has(dateKey(w))) w = addDays(w, -7); // la semana actual aún puede completarse
  while (weeks.has(dateKey(w))) { n++; w = addDays(w, -7); }
  return n;
}

export function lastTrained(sessions) {
  const out = {};
  for (const s of sessions) for (const it of activeItems(s)) {
    if (!(it.sets || []).some(isWorkSet)) continue;
    for (const m of it.primary || []) if (!out[m] || out[m] < s.date) out[m] = s.date;
  }
  return out;
}

export function classifyVolume(sets, m) {
  if (!sets) return 0;
  if (!m.max) return 3; // sin meta dedicada: cualquier trabajo cuenta como suficiente
  if (sets < m.min) return 1;
  if (sets <= m.max) return 3;
  return 4;
}
