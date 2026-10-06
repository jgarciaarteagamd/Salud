// Editor de una sesión: tabla por ejercicio (cada fila una serie: reps, peso, RIR),
// sustituir / omitir / agregar ejercicios, temporizador de descanso y cierre de sesión.
import { saveDoc, deleteDoc, newId, getState } from '../store.js';
import { MUSCLES, muscleShort } from '../muscles.js';
import { lastPerformance, num, fmtNum, fmtDay, isWorkSet, sessionVolume, sessionSetCount, todayKey, fmtSet } from '../stats.js';
import { ExerciseInfo } from './exinfo.js';
import { Icon, Sheet, ExThumb, Confirm, toast, copyText } from '../ui.js';
const { html, useState, useEffect, useRef, useMemo } = window.htmPreact;

export const SKIP_REASONS = ['No alcancé el tiempo', 'Máquina ocupada', 'Molestia en rodilla', 'Molestia en espalda', 'Cansancio', 'No me gustó'];
export const SWAP_REASONS = ['Máquina ocupada', 'Molestia en rodilla', 'Molestia en espalda', 'Preferí otra variante', 'Falta de equipo'];

const clone = (o) => JSON.parse(JSON.stringify(o));
const emptySet = (weight = '') => ({ reps: '', secs: '', weight, rir: '', done: false });
const isTimed = (it) => it.medida === 'tiempo';
const isBodyweight = (it) => it.modalidad === 'freeletics';

export function makeItem(ex, { origin = 'plan', planned = null, sessions = [], date = todayKey() } = {}) {
  const lp = lastPerformance(sessions, ex.id, date);
  const nSets = planned?.series || lp?.sets.length || 3;
  const w = planned?.peso ?? lp?.sets?.[0]?.weight ?? '';
  return {
    uid: newId('it'), exerciseId: ex.id, name: ex.name,
    primary: ex.primary || [], secondary: ex.secondary || [],
    medida: ex.medida || 'reps', unilateral: !!ex.unilateral, modalidad: ex.modalidad || 'forus', categoria: ex.categoria || 'fuerza',
    origin, status: 'pendiente', planned,
    sets: Array.from({ length: nSets }, () => emptySet(w === null ? '' : w)),
  };
}

function itemStatusFromSets(it) {
  if (it.status === 'omitido' || it.status === 'sustituido') return it.status;
  return (it.sets || []).some(isWorkSet) ? 'hecho' : 'pendiente';
}

function targetText(p) {
  if (!p) return null;
  const parts = [`${p.series || '?'} × ${p.segundos ? `${p.segundos} s` : p.reps || '?'}`];
  if (p.peso != null && p.peso !== '') parts.push(`${p.peso} kg`);
  if (p.rir != null) parts.push(`RIR ${p.rir}`);
  if (p.descansoSeg) parts.push(`${p.descansoSeg} s`);
  return parts.join(' · ');
}

/* ---------- selector de ejercicio ---------- */
export function ExercisePicker({ title = 'Agregar ejercicio', reasons, onPick, onClose, lugar = 'forus' }) {
  const { exercises } = getState();
  const [q, setQ] = useState('');
  const [m, setM] = useState('');
  const [mod, setMod] = useState(lugar);
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [nName, setNName] = useState('');
  const [nPrim, setNPrim] = useState([]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return exercises.filter((e) => !e.archived && (e.modalidad || 'forus') === mod)
      .filter((e) => !m || (e.primary || []).includes(m) || (e.secondary || []).includes(m))
      .filter((e) => !s || e.name.toLowerCase().includes(s) || (e.equipment || '').toLowerCase().includes(s))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [exercises, q, m, mod]);

  async function createAndPick() {
    if (!nName.trim() || !nPrim.length) { toast('Ponle nombre y al menos un músculo'); return; }
    const ex = { id: newId(mod === 'freeletics' ? 'fl' : 'ex'), name: nName.trim(), primary: nPrim, secondary: [], equipment: mod === 'freeletics' ? 'Peso corporal' : '', modalidad: mod, knee: 'ok', back: 'ok', createdAt: new Date().toISOString() };
    await saveDoc('exercises', ex.id, ex);
    onPick(ex, reason);
  }

  return html`
    <${Sheet} title=${title} onClose=${onClose}>
      ${reasons && html`
        <div class="stack-sm">
          <span class="eyebrow">¿Por qué el cambio?</span>
          <div class="chips">${reasons.map((r) => html`<button class="chip" aria-pressed=${reason === r} onClick=${() => setReason(reason === r ? '' : r)}>${r}</button>`)}</div>
        </div>`}
      ${creating ? html`
        <div class="stack-sm panel">
          <label class="field"><span>Nombre</span><input id="new-ex-name" class="input" value=${nName} onInput=${(e) => setNName(e.target.value)} placeholder="Ej. Press inclinado en máquina" /></label>
          <span class="eyebrow">Músculo principal</span>
          <div class="chips">${MUSCLES.map((mm) => html`<button class="chip" aria-pressed=${nPrim.includes(mm.id)} onClick=${() => setNPrim(nPrim.includes(mm.id) ? nPrim.filter((x) => x !== mm.id) : [...nPrim, mm.id])}>${muscleShort(mm.id)}</button>`)}</div>
          <div class="row"><button class="btn btn-primary" onClick=${createAndPick}>Crear y usar</button><button class="btn btn-ghost" onClick=${() => setCreating(false)}>Volver a la lista</button></div>
        </div>` : html`
        <div class="seg" role="group" style="align-self:flex-start"><button aria-pressed=${mod === 'forus'} onClick=${() => setMod('forus')}>Forus</button><button aria-pressed=${mod === 'freeletics'} onClick=${() => setMod('freeletics')}>Freeletics</button></div>
        <input id="pick-q" class="input" type="search" placeholder="Buscar ejercicio o equipo" value=${q} onInput=${(e) => setQ(e.target.value)} />
        <div class="chips">
          <button class="chip" aria-pressed=${!m} onClick=${() => setM('')}>Todos</button>
          ${MUSCLES.map((mm) => html`<button class="chip" aria-pressed=${m === mm.id} onClick=${() => setM(m === mm.id ? '' : mm.id)}>${muscleShort(mm.id)}</button>`)}
        </div>
        <div class="picker-list">
          ${list.map((e) => html`
            <button class="pick" onClick=${() => onPick(e, reason)}>
              <${ExThumb} ex=${e} />
              <div class="grow"><b>${e.name}</b><div class="xs muted">${(e.primary || []).map(muscleShort).join(' · ')}${e.equipment ? ` — ${e.equipment}` : ''}</div></div>
              <${Icon} name="plus" />
            </button>`)}
          ${!list.length && html`<p class="muted small">No hay ejercicios con ese filtro.</p>`}
        </div>
        <button class="btn" onClick=${() => { setCreating(true); setNName(q); }}><${Icon} name="plus" /> Crear ejercicio nuevo</button>`}
    </${Sheet}>`;
}

function ReasonSheet({ title, reasons, onPick, onClose }) {
  const [other, setOther] = useState('');
  return html`
    <${Sheet} title=${title} onClose=${onClose}>
      <div class="chips">${reasons.map((r) => html`<button class="chip" onClick=${() => onPick(r)}>${r}</button>`)}</div>
      <label class="field"><span>Otro motivo</span><input id="reason-other" class="input" value=${other} onInput=${(e) => setOther(e.target.value)} placeholder="Escribe el motivo" /></label>
      <div class="row"><button class="btn btn-primary" onClick=${() => onPick(other.trim() || 'Sin motivo')}>Guardar motivo</button></div>
    </${Sheet}>`;
}

function NoteSheet({ value, onSave, onClose }) {
  const [v, setV] = useState(value || '');
  return html`
    <${Sheet} title="Nota del ejercicio" onClose=${onClose}>
      <textarea id="item-note" class="textarea" value=${v} onInput=${(e) => setV(e.target.value)} placeholder="Ej. Dolor leve en rodilla en la última serie"></textarea>
      <div class="row"><button class="btn btn-primary" onClick=${() => onSave(v.trim())}>Guardar nota</button></div>
    </${Sheet}>`;
}

function Range({ id, label, value, onInput, min = 0, max = 10 }) {
  return html`<label class="field"><span>${label}</span>
    <div class="range-row"><input id=${id} type="range" min=${min} max=${max} step="1" value=${value} onInput=${(e) => onInput(+e.target.value)} /><span class="range-val">${value}</span></div></label>`;
}

const RPE_TEXT = {
  1: '1 · Muy fácil, casi sin esfuerzo.', 2: '2 · Fácil.', 3: '3 · Suave, podrías conversar sin problema.',
  4: '4 · Moderado-suave.', 5: '5 · Moderado: trabajaste, pero sobraba mucha energía.',
  6: '6 · Algo duro: cómodo pero exigente.', 7: '7 · Duro: trabajaste bien y te quedaba margen.',
  8: '8 · Muy duro: pocas series más te hubieran salido.', 9: '9 · Casi al máximo.',
  10: '10 · Máximo: no podías hacer ni una serie más.',
};

function PostSheet({ initial, onSave, onClose }) {
  const [p, setP] = useState({ rpe: 7, dolorRodilla: 0, dolorEspalda: 0, duracion: '', notas: '', ...(initial || {}) });
  const up = (k) => (v) => setP({ ...p, [k]: v });
  return html`
    <${Sheet} title="Cerrar sesión" onClose=${onClose}>
      <p class="muted small">Esto ayuda a Claude a ajustar la próxima sesión.</p>
      <${Range} id="post-rpe" label="Esfuerzo de la sesión (RPE)" value=${p.rpe} onInput=${up('rpe')} min="1" />
      <p class="xs muted" style="margin-top:-8px">${RPE_TEXT[p.rpe]}</p>
      <${Range} id="post-knee" label="Dolor rodilla derecha al terminar" value=${p.dolorRodilla} onInput=${up('dolorRodilla')} />
      <${Range} id="post-back" label="Dolor de espalda al terminar" value=${p.dolorEspalda} onInput=${up('dolorEspalda')} />
      <label class="field"><span>Duración (min)</span><input id="post-dur" class="input" inputmode="numeric" value=${p.duracion} onInput=${(e) => up('duracion')(e.target.value)} /></label>
      <label class="field"><span>Notas</span><textarea id="post-notes" class="textarea" value=${p.notas} onInput=${(e) => up('notas')(e.target.value)} placeholder="¿Cómo te sentiste? ¿Algo que Claude deba saber?"></textarea></label>
      <button class="btn btn-primary btn-xl" onClick=${() => onSave(p)}>Guardar sesión</button>
    </${Sheet}>`;
}

/* ---------- tarjeta de ejercicio ---------- */
function ExerciseCard({ item, ex, sessions, date, sessionId, onChange, onRemove, onAskSwap, onAskSkip, onAskNote, onSetDone, onInfo }) {
  const [open, setOpen] = useState(false);
  const lp = useMemo(() => lastPerformance(sessions, item.exerciseId, date, sessionId), [sessions, item.exerciseId, date, sessionId]);
  const omitted = item.status === 'omitido';
  const p = item.planned;
  const timed = isTimed(item); const bw = isBodyweight(item);
  const repsHint = timed ? (p?.segundos ?? lp?.sets?.[0]?.secs ?? '') : p?.reps ? String(p.reps).split('-')[0] : (lp?.sets?.[0]?.reps ?? '');
  const mainKey = timed ? 'secs' : 'reps';
  const rirHint = p?.rir ?? '';

  const setField = (i, k, v) => {
    const sets = item.sets.map((s, j) => (j === i ? { ...s, [k]: v } : s));
    onChange({ ...item, sets });
  };
  const toggleDone = (i) => {
    const s = item.sets[i];
    const done = !s.done;
    const next = { ...s, done };
    if (done && !num(s[mainKey]) && repsHint) next[mainKey] = String(repsHint);
    if (done && (s.rir === '' || s.rir == null) && rirHint !== '') next.rir = String(rirHint);
    const sets = item.sets.map((x, j) => (j === i ? next : x));
    onChange({ ...item, sets });
    if (done) onSetDone(p?.descansoSeg || 90);
  };
  const addSet = () => { const last = item.sets[item.sets.length - 1]; onChange({ ...item, sets: [...item.sets, emptySet(last?.weight ?? '')] }); };
  const removeSet = () => { if (item.sets.length > 1) onChange({ ...item, sets: item.sets.slice(0, -1) }); };

  const statusChip = {
    hecho: html`<span class="chip good">Hecho</span>`,
    omitido: html`<span class="chip warn">Omitido</span>`,
    sustituido: html`<span class="chip primary">Sustituido</span>`,
    pendiente: null,
  }[item.status];

  return html`
    <article class=${'ex-card' + (omitted ? ' omitido' : '')}>
      <div class="ex-head">
        <button class="thumb-btn" aria-label=${`Ver cómo se hace ${item.name}`} onClick=${onInfo}><${ExThumb} ex=${ex} item=${item} /></button>
        <div class="grow stack-sm" style="gap:3px">
          <button class="ex-title link" onClick=${onInfo}>${item.name}${item.unilateral ? html` <span class="xs muted">· por lado</span>` : null}</button>
          ${p && html`<div class="ex-target num">Meta: ${targetText(p)}</div>`}
          <div class="row" style="gap:4px">
            ${statusChip}
            ${item.origin === 'agregado' && html`<span class="chip">Agregado</span>`}
            ${item.primary.slice(0, 2).map((m) => html`<span class="chip">${muscleShort(m)}</span>`)}
          </div>
        </div>
        <button class="icon-btn" aria-label="Opciones" aria-expanded=${open} onClick=${() => setOpen(!open)}><${Icon} name="more" /></button>
      </div>
      ${open && html`
        <div class="menu">
          ${!omitted && html`<button class="btn btn-sm" onClick=${() => { setOpen(false); onAskSwap(); }}><${Icon} name="swap" size="16" /> Sustituir</button>`}
          ${!omitted && item.origin !== 'agregado' && html`<button class="btn btn-sm" onClick=${() => { setOpen(false); onAskSkip(); }}><${Icon} name="skip" size="16" /> Omitir</button>`}
          ${omitted && html`<button class="btn btn-sm" onClick=${() => { setOpen(false); onChange({ ...item, status: 'pendiente', reason: null }); }}>Restaurar</button>`}
          <button class="btn btn-sm" onClick=${() => { setOpen(false); onAskNote(); }}><${Icon} name="note" size="16" /> Nota</button>
          ${item.origin === 'agregado' && html`<button class="btn btn-sm btn-danger" onClick=${() => { setOpen(false); onRemove(); }}><${Icon} name="trash" size="16" /> Quitar</button>`}
        </div>`}
      ${omitted ? html`<div class="ex-body"><p class="small muted">Motivo: ${item.reason || '—'}</p></div>` : html`
        <div class="ex-body">
          ${item.status === 'sustituido' && html`<p class="xs muted">En lugar de ${item.replacedFrom?.name}${item.reason ? ` · ${item.reason}` : ''}</p>`}
          ${p?.nota && html`<p class="small plan-note">${p.nota}</p>`}
          <table class="sets">
            <thead><tr><th>Serie</th><th>${timed ? 'Seg' : 'Reps'}</th>${bw ? null : html`<th>Peso kg</th>`}<th>RIR</th><th><span class="sr">Hecha</span></th></tr></thead>
            <tbody>
              ${item.sets.map((s, i) => html`
                <tr class=${s.done ? 'done' : ''}>
                  <td>${i + 1}</td>
                  <td><input id=${`${item.uid}-r${i}`} inputmode="numeric" aria-label=${`${timed ? 'Segundos' : 'Repeticiones'} serie ${i + 1}`} placeholder=${repsHint} value=${s[mainKey] ?? ''} onInput=${(e) => setField(i, mainKey, e.target.value)} /></td>
                  ${bw ? null : html`<td><input id=${`${item.uid}-w${i}`} inputmode="decimal" aria-label=${`Peso serie ${i + 1}`} placeholder=${p?.peso ?? '—'} value=${s.weight} onInput=${(e) => setField(i, 'weight', e.target.value)} /></td>`}
                  <td><input id=${`${item.uid}-i${i}`} inputmode="numeric" aria-label=${`RIR serie ${i + 1}`} placeholder=${rirHint} value=${s.rir} onInput=${(e) => setField(i, 'rir', e.target.value)} /></td>
                  <td><button class="check" aria-pressed=${!!s.done} aria-label=${`Marcar serie ${i + 1} como hecha`} onClick=${() => toggleDone(i)}><${Icon} name="check" /></button></td>
                </tr>`)}
            </tbody>
          </table>
          <div class="row-between">
            <span class="last-time num">${lp ? `Última vez (${fmtDay(lp.date)}): ${lp.sets.map(fmtSet).join(', ')}` : 'Primera vez con este ejercicio'}</span>
            <div class="row" style="gap:4px">
              <button class="btn btn-sm btn-ghost" onClick=${removeSet} disabled=${item.sets.length <= 1}>− Serie</button>
              <button class="btn btn-sm" onClick=${addSet}>+ Serie</button>
            </div>
          </div>
          ${item.note && html`<p class="xs muted">Nota: ${item.note}</p>`}
        </div>`}
    </article>`;
}

/* ---------- temporizador de descanso ---------- */
function RestTimer({ until, onDone }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => { if (left === 0) { try { navigator.vibrate?.(300); } catch { /* sin vibración */ } onDone(); } }, [left === 0]);
  return html`<div class="timer" aria-live="polite"><${Icon} name="timer" /> ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div>`;
}

/* ---------- llevar la sesión a "Crear workout" de Freeletics ---------- */
export function freeleticsRounds(session) {
  const items = (session.items || []).filter((i) => i.status !== 'omitido');
  const mob = items.filter((i) => i.categoria === 'movilidad');
  const work = items.filter((i) => i.categoria !== 'movilidad');
  const amount = (it) => {
    const p = it.planned || {};
    const v = it.medida === 'tiempo' ? `${p.segundos || it.sets?.[0]?.secs || 30} s` : `${p.reps || it.sets?.[0]?.reps || 10} reps`;
    return `${v}${it.unilateral ? ' por lado' : ''}`;
  };
  const n = Math.max(1, ...work.map((i) => i.planned?.series || i.sets?.length || 1));
  const rounds = Array.from({ length: n }, (_, r) => work.filter((i) => (i.planned?.series || i.sets?.length || 1) > r)
    .map((i) => ({ name: i.name, amount: amount(i), pausa: i.planned?.descansoSeg || 30 })));
  return { mob: mob.map((i) => ({ name: i.name, amount: amount(i) })), rounds };
}

function FreeleticsExport({ session }) {
  const [open, setOpen] = useState(false);
  const { mob, rounds } = freeleticsRounds(session);
  const text = [
    `Workout: ${session.title || 'Sesión en casa'}`,
    ...(mob.length ? ['', 'Calentamiento / movilidad:', ...mob.map((m) => `- ${m.name} · ${m.amount}`)] : []),
    ...rounds.flatMap((r, i) => ['', `Ronda ${i + 1}/${rounds.length}`, ...r.flatMap((x) => [`+ Exercise: ${x.name} · ${x.amount}`, `+ Pausa: ${x.pausa} s`])]),
  ].join('\n');
  return html`
    <section class="panel stack-sm">
      <button class="row-between" style="background:none;border:0;padding:0;cursor:pointer;color:var(--ink)" aria-expanded=${open} onClick=${() => setOpen(!open)}>
        <span class="eyebrow">Crear este workout en Freeletics</span><${Icon} name=${open ? 'back' : 'chevron'} size="16" />
      </button>
      ${open && html`
        <p class="small">En Freeletics: Crear workout → ponle el nombre → en cada ronda toca <b>+ Exercise</b> y <b>+ Pausa</b> en este orden. Con "Duplicar ronda" ahorras pasos si las rondas son iguales.</p>
        <div class="copybox">${text}</div>
        <button class="btn btn-sm" style="align-self:flex-start" onClick=${() => copyText(text)}><${Icon} name="copy" size="16" /> Copiar</button>
        <p class="xs muted">Al terminar, registra aquí las repeticiones o segundos reales para que cuenten en tu progreso.</p>`}
    </section>`;
}

/* ---------- editor ---------- */
export function SessionEditor({ session, mode = 'live', onClosed }) {
  const st = getState();
  const [draft, setDraft] = useState(() => clone(session));
  const [sheet, setSheet] = useState(null);
  const [restUntil, setRestUntil] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [info, setInfo] = useState(null);
  const saveTimer = useRef(null);
  const exById = useMemo(() => Object.fromEntries(st.exercises.map((e) => [e.id, e])), [st.exercises]);
  const others = useMemo(() => st.sessions.filter((s) => s.id !== draft.id), [st.sessions, draft.id]);

  // Si la sesión cambia en otro dispositivo y aquí no hay cambios pendientes, tomar la versión nueva.
  useEffect(() => { if (!dirty && session.updatedAt !== draft.updatedAt) setDraft(clone(session)); }, [session.updatedAt]);

  // Mantener la pantalla encendida durante la sesión en vivo.
  useEffect(() => {
    if (mode !== 'live') return undefined;
    let lock = null;
    navigator.wakeLock?.request?.('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch(() => {}); };
  }, [mode]);

  // Autoguardado en vivo: la sesión en curso queda sincronizada aunque se cierre la app.
  const commit = (next) => {
    setDraft(next);
    setDirty(true);
    if (mode === 'live') {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await saveDoc('sessions', next.id, { ...next, status: next.status === 'plan' ? 'en_curso' : next.status });
        setDirty(false);
      }, 1200);
    }
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const updateItem = (uid, it) => commit({ ...draft, items: draft.items.map((x) => (x.uid === uid ? { ...it, status: itemStatusFromSets(it) } : x)) });
  const removeItem = (uid) => commit({ ...draft, items: draft.items.filter((x) => x.uid !== uid) });

  const doSwap = (uid) => setSheet({
    kind: 'swap',
    onPick: (ex, reason) => {
      const it = draft.items.find((x) => x.uid === uid);
      const base = it.status === 'sustituido' ? it.replacedFrom : { exerciseId: it.exerciseId, name: it.name };
      const fresh = makeItem(ex, { origin: it.origin, planned: it.planned ? { ...it.planned, peso: null } : null, sessions: others, date: draft.date });
      commit({ ...draft, items: draft.items.map((x) => (x.uid === uid ? { ...fresh, uid, origin: it.origin, status: 'sustituido', replacedFrom: base, reason: reason || null } : x)) });
      setSheet(null);
    },
  });
  const doSkip = (uid) => setSheet({
    kind: 'skip',
    onPick: (reason) => {
      commit({ ...draft, items: draft.items.map((x) => (x.uid === uid ? { ...x, status: 'omitido', reason } : x)) });
      setSheet(null);
    },
  });
  const doNote = (uid) => setSheet({ kind: 'note', uid });
  const doAdd = () => setSheet({
    kind: 'add',
    onPick: (ex) => {
      commit({ ...draft, items: [...draft.items, makeItem(ex, { origin: 'agregado', sessions: others, date: draft.date })] });
      setSheet(null);
      toast(`${ex.name} agregado`);
    },
  });

  async function finish(post) {
    const items = draft.items.filter((it) => !(it.origin === 'agregado' && it.status !== 'omitido' && !(it.sets || []).some(isWorkSet))).map((it) => {
      if (it.status === 'pendiente' && !(it.sets || []).some(isWorkSet)) return { ...it, status: 'omitido', reason: it.reason || 'Sin registrar al guardar' };
      return { ...it, sets: (it.sets || []).filter((s, i, arr) => isWorkSet(s) || arr.length === 1) };
    });
    const now = new Date().toISOString();
    const next = { ...draft, items, post, status: 'guardada', savedAt: draft.savedAt || now };
    if (mode === 'edit') next.editLog = [...(draft.editLog || []), { at: now, nota: 'Corregida desde el historial' }];
    clearTimeout(saveTimer.current);
    await saveDoc('sessions', next.id, next);
    setDirty(false);
    setSheet(null);
    toast(mode === 'edit' ? 'Cambios guardados' : 'Sesión guardada');
    onClosed?.(next); // en vivo, la pestaña Hoy muestra los logros
  }

  async function saveEdits() {
    const now = new Date().toISOString();
    const next = { ...draft, editLog: [...(draft.editLog || []), { at: now, nota: 'Corregida desde el historial' }] };
    await saveDoc('sessions', next.id, next);
    setDirty(false);
    toast('Cambios guardados');
    onClosed?.(next);
  }

  const totalSets = sessionSetCount(draft);
  const vol = sessionVolume(draft);
  const plan = draft.plan;
  const active = draft.items.filter((i) => i.status !== 'omitido');
  const omitted = draft.items.filter((i) => i.status === 'omitido');
  const noteItem = sheet?.kind === 'note' ? draft.items.find((x) => x.uid === sheet.uid) : null;

  return html`
    <div class="stack">
      <header class="sess-head">
        <span class="eyebrow">${fmtDay(draft.date)} · ${draft.lugar === 'freeletics' ? 'Freeletics · ' : ''}${draft.source === 'ia' ? 'Sesión de Claude' : draft.source === 'importada' ? 'Importada de Mi Salud' : 'Sesión manual'}${draft.status === 'guardada' ? ' · Guardada' : ''}</span>
        ${mode === 'edit'
          ? html`<input id="sess-title" class="input" style="font-family:var(--f-display);font-size:1.6rem;font-weight:600" value=${draft.title} onInput=${(e) => commit({ ...draft, title: e.target.value })} />`
          : html`<h1>${draft.title || 'Sesión de hoy'}</h1>`}
        ${mode === 'edit' && html`<label class="field" style="max-width:220px"><span>Fecha</span><input id="sess-date" type="date" class="input" value=${draft.date} onInput=${(e) => commit({ ...draft, date: e.target.value })} /></label>`}
        <div class="row small muted num"><span>${active.length} ejercicios</span>·<span>${totalSets} series</span>${vol ? html`·<span>${fmtNum(vol, 0)} kg movidos</span>` : null}</div>
      </header>

      ${draft.lugar === 'freeletics' && mode === 'live' && html`<${FreeleticsExport} session=${draft} />`}
      ${plan?.razonamiento && html`
        <section class="panel stack-sm">
          <span class="eyebrow">Por qué esta sesión</span>
          <p>${plan.razonamiento}</p>
          ${plan.precauciones?.length ? html`<div class="stack-sm"><span class="eyebrow">Precauciones</span><ul class="small" style="margin:0;padding-left:18px">${plan.precauciones.map((x) => html`<li>${x}</li>`)}</ul></div>` : null}
          ${plan.calentamiento?.length ? html`<div class="stack-sm"><span class="eyebrow">Calentamiento</span><ul class="small" style="margin:0;padding-left:18px">${plan.calentamiento.map((x) => html`<li>${x}</li>`)}</ul></div>` : null}
        </section>`}

      ${active.map((it) => html`<${ExerciseCard} key=${it.uid} item=${it} ex=${exById[it.exerciseId]} sessions=${others} date=${draft.date} sessionId=${draft.id}
          onChange=${(x) => updateItem(it.uid, x)} onRemove=${() => removeItem(it.uid)}
          onAskSwap=${() => doSwap(it.uid)} onAskSkip=${() => doSkip(it.uid)} onAskNote=${() => doNote(it.uid)}
          onSetDone=${(sec) => setRestUntil(Date.now() + sec * 1000)} onInfo=${() => setInfo(it.exerciseId)} />`)}

      <button class="btn btn-block" onClick=${doAdd}><${Icon} name="plus" /> Agregar ejercicio</button>

      ${omitted.length ? html`
        <section class="stack-sm">
          <span class="eyebrow">Omitidos (${omitted.length})</span>
          ${omitted.map((it) => html`<${ExerciseCard} key=${it.uid} item=${it} ex=${exById[it.exerciseId]} sessions=${others} date=${draft.date} sessionId=${draft.id}
            onChange=${(x) => updateItem(it.uid, x)} onRemove=${() => removeItem(it.uid)} onAskSwap=${() => {}} onAskSkip=${() => {}} onAskNote=${() => doNote(it.uid)} onSetDone=${() => {}} onInfo=${() => setInfo(it.exerciseId)} />`)}
        </section>` : null}

      ${plan?.vuelta_calma?.length ? html`<section class="panel stack-sm"><span class="eyebrow">Vuelta a la calma</span><ul class="small" style="margin:0;padding-left:18px">${plan.vuelta_calma.map((x) => html`<li>${x}</li>`)}</ul></section>` : null}

      ${mode === 'edit' && html`
        <section class="stack-sm">
          ${draft.post && html`<p class="small muted">Cierre: RPE ${draft.post.rpe} · rodilla ${draft.post.dolorRodilla}/10 · espalda ${draft.post.dolorEspalda}/10${draft.post.notas ? ` · ${draft.post.notas}` : ''}</p>`}
          <button class="btn btn-ghost btn-danger" onClick=${() => setSheet({ kind: 'delete' })}><${Icon} name="trash" /> Eliminar sesión</button>
        </section>`}

      <div class="savebar">
        ${restUntil ? html`<div class="row grow"><${RestTimer} until=${restUntil} onDone=${() => setRestUntil(null)} /><button class="btn btn-sm btn-ghost" onClick=${() => setRestUntil(null)}>Saltar</button></div>`
          : html`<div class="grow small muted" style="align-self:center">${mode === 'live' ? (dirty ? 'Guardando borrador…' : 'Borrador sincronizado') : (dirty ? 'Cambios sin guardar' : 'Sin cambios')}</div>`}
        ${mode === 'live'
          ? html`<button class="btn btn-primary" onClick=${() => setSheet({ kind: 'post' })}><${Icon} name="check" /> Guardar sesión</button>`
          : html`<button class="btn" onClick=${() => onClosed?.(null)}>Cerrar</button><button class="btn btn-primary" disabled=${!dirty} onClick=${saveEdits}>Guardar cambios</button>`}
      </div>

      ${info && html`<${ExerciseInfo} exerciseId=${info} onClose=${() => setInfo(null)} />`}
      ${sheet?.kind === 'add' && html`<${ExercisePicker} lugar=${draft.lugar || 'forus'} onPick=${sheet.onPick} onClose=${() => setSheet(null)} />`}
      ${sheet?.kind === 'swap' && html`<${ExercisePicker} lugar=${draft.lugar || 'forus'} title="Sustituir por…" reasons=${SWAP_REASONS} onPick=${sheet.onPick} onClose=${() => setSheet(null)} />`}
      ${sheet?.kind === 'skip' && html`<${ReasonSheet} title="¿Por qué lo omites?" reasons=${SKIP_REASONS} onPick=${sheet.onPick} onClose=${() => setSheet(null)} />`}
      ${noteItem && html`<${NoteSheet} value=${noteItem.note} onSave=${(v) => { updateItem(noteItem.uid, { ...noteItem, note: v }); setSheet(null); }} onClose=${() => setSheet(null)} />`}
      ${sheet?.kind === 'post' && html`<${PostSheet} initial=${draft.post} onSave=${finish} onClose=${() => setSheet(null)} />`}
      ${sheet?.kind === 'delete' && html`<${Confirm} title="Eliminar sesión" text=${`Se borrará la sesión del ${fmtDay(draft.date)} y sus series. No se puede deshacer.`}
          onConfirm=${async () => { await deleteDoc('sessions', draft.id); toast('Sesión eliminada'); onClosed?.(null); }} onClose=${() => setSheet(null)} />`}
    </div>`;
}
