// Datos del reloj para una sesión de Forus o Freeletics. Una sesión puede tener varios registros del reloj
// (p. ej. "Elíptica", "Ejercicios de fuerza con máquinas" y "Enfriamiento"): cada uno con duración y calorías.
// Vienen de la pantalla "Datos de Entrenos" de la app Salud del iPhone, que muestra todos los entrenos del día
// en una sola captura y la FC mínima y máxima solo del último. Los registros antiguos (Samsung Health)
// traen además FC media y zonas.
import { uploadImage, canUpload, assetUrl, blobsFromAssets } from '../store.js';
import { extractWorkouts, imageLimits, errorCopy } from '../ai.js';
import { fmtClock } from '../fields.js';
import { fmtNum, num } from '../stats.js';
import { Icon, Sheet, Thinking, toast, FilePick } from '../ui.js';
const { html, useState, useEffect, useRef } = window.htmPreact;

const FIELDS = [
  { key: 'duracionMin', label: 'Duración', unit: 'min' },
  { key: 'kcal', label: 'Calorías', unit: 'kcal' },
  { key: 'fcMin', label: 'FC mínima', unit: 'lpm' },
  { key: 'fcMax', label: 'FC máxima', unit: 'lpm' },
  { key: 'fcMedia', label: 'FC media', unit: 'lpm' },
];
export const WATCH_PARTS = {
  cardio: 'Cardio (elíptica, cinta…)', calentamiento: 'Calentamiento', bloque: 'Bloque principal', enfriamiento: 'Vuelta a la calma', sesion: 'Toda la sesión', otro: 'Otro',
};

// Registros del reloj de una sesión (las sesiones antiguas tienen uno solo en `reloj`).
export const watchRecords = (s) => s?.relojes || (s?.reloj ? [{ parte: 'sesion', ...s.reloj }] : []);

export function watchTotals(list) {
  const rows = list.filter((r) => !r.pendiente);
  if (!rows.length) return null;
  const dur = rows.reduce((t, r) => t + (num(r.duracionMin) || 0), 0);
  const kcal = rows.reduce((t, r) => t + (num(r.kcal) || 0), 0);
  const wFc = rows.filter((r) => num(r.fcMedia) && num(r.duracionMin));
  const fcMedia = wFc.length ? wFc.reduce((t, r) => t + r.fcMedia * r.duracionMin, 0) / wFc.reduce((t, r) => t + r.duracionMin, 0) : null;
  const fcMax = Math.max(0, ...rows.map((r) => num(r.fcMax) || 0)) || null;
  const mins = rows.map((r) => num(r.fcMin)).filter((x) => x);
  return { duracionMin: dur || null, kcal: kcal || null, fcMin: mins.length ? Math.min(...mins) : null, fcMax, fcMedia };
}

const summary = (r) => [r.duracionMin && fmtClock(r.duracionMin * 60), r.kcal && `${fmtNum(r.kcal, 0)} kcal`,
  r.fcMedia && `FC ${fmtNum(r.fcMedia, 0)}`, r.fcMin && r.fcMax ? `FC ${fmtNum(r.fcMin, 0)}–${fmtNum(r.fcMax, 0)}` : r.fcMax && `máx ${fmtNum(r.fcMax, 0)}`].filter(Boolean).join(' · ');
export function watchSummary(session) {
  const list = watchRecords(session); const t = watchTotals(list);
  if (!t) return list.length ? 'captura sin leer' : '';
  return `${summary(t)}${list.length > 1 ? ` (${list.length} registros)` : ''}`;
}

// Parte probable de la sesión según el nombre que pone el reloj y lo que ya hay registrado.
function guessPart(actividad, existing, hora) {
  const a = (actividad || '').toLowerCase();
  const block = existing.find((r) => r.parte === 'bloque' || r.parte === 'sesion');
  const before = block?.hora && hora ? hora < block.hora : !block;
  if (/el[ií]ptica|caminata|bicicleta|cinta|remo|escaladora|correr|carrera/.test(a)) return 'cardio';
  if (/enfriamiento|vuelta a la calma/.test(a)) return 'enfriamiento';
  if (/calentamiento/.test(a)) return 'calentamiento';
  if (/estiramiento|movilidad|flexibilidad|yoga/.test(a)) return before ? 'calentamiento' : 'enfriamiento';
  if (/m[aá]quinas|musculaci|pesas|fuerza|circuito/.test(a)) return existing.length ? 'bloque' : 'sesion';
  return existing.length ? 'otro' : 'sesion';
}

// Un entreno leído de la captura → registro de la sesión.
function toRecord(e) {
  const rec = { actividad: e?.actividad || '', hora: /^\d{1,2}:\d{2}$/.test(e?.hora || '') ? e.hora.padStart(5, '0') : '', zonasFC: e?.zonasFC || '' };
  for (const f of FIELDS) if (num(e?.[f.key]) != null) rec[f.key] = num(e[f.key]);
  return rec;
}
const sameWorkout = (a, b) => (a.actividad || '').toLowerCase() === (b.actividad || '').toLowerCase()
  && Math.round(num(a.duracionMin) || 0) === Math.round(num(b.duracionMin) || 0);

// Suma los entrenos leídos a la lista. Si un entreno ya estaba (otra captura de la misma pantalla),
// solo completa los datos que le faltaban, como la FC del último entreno.
function mergeWorkouts(list, recs, imagenes, dispositivo) {
  let next = [...list]; let added = 0;
  for (const r of recs) {
    if (!FIELDS.some((f) => r[f.key] != null)) continue;
    const i = next.findIndex((x) => !x.pendiente && sameWorkout(x, r));
    if (i >= 0) {
      const cur = next[i]; const upd = { ...cur };
      for (const [k, v] of Object.entries(r)) if (v !== '' && v != null && (cur[k] == null || cur[k] === '')) upd[k] = v;
      next = next.map((x, j) => (j === i ? upd : x));
      continue;
    }
    next = [...next, { ...r, dispositivo: dispositivo || '', imagenes: [...imagenes], parte: guessPart(r.actividad, next, r.hora) }];
    added++;
  }
  return { next, added };
}

function WatchSheet({ value, existing, onSave, onReplace, onDelete, onClose }) {
  const [vals, setVals] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, value?.[f.key] != null ? String(value[f.key]) : ''])));
  const [extra, setExtra] = useState({ actividad: value?.actividad || '', hora: value?.hora || '', zonasFC: value?.zonasFC || '', dispositivo: value?.dispositivo || '' });
  const [parte, setParte] = useState(value?.parte || '');
  const [files, setFiles] = useState([]); const [previews, setPreviews] = useState([]);
  const [imgCaps, setImgCaps] = useState(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const ctl = useRef(null);
  useEffect(() => { imageLimits().then(setImgCaps); }, []);
  // Captura guardada sin leer: se lee sola al abrirla en una vista que puede leer imágenes.
  useEffect(() => { if (value?.pendiente && value?.imagenes?.length) read(); }, []);
  const tried = useRef(false);
  useEffect(() => { const u = files.map((f) => URL.createObjectURL(f)); setPreviews(u); return () => u.forEach((x) => URL.revokeObjectURL(x)); }, [files]);
  const saved = value?.imagenes || [];

  async function read(override) {
    tried.current = true;
    setBusy('read'); setErr(''); ctl.current = new AbortController();
    try {
      const imgs = override || (files.length ? files : await blobsFromAssets(saved));
      const res = await extractWorkouts(imgs, { signal: ctl.current.signal });
      const recs = (res?.entrenos || []).map(toRecord).filter((r) => FIELDS.some((f) => r[f.key] != null));
      if (!recs.length) { setErr('No se encontraron entrenos en la captura. Escribe los valores a mano.'); return; }
      const empty = !FIELDS.some((f) => num(vals[f.key]) != null);
      // Varios entrenos en la captura (la pantalla "Datos de Entrenos"): uno por registro.
      if (recs.length > 1 && empty && onReplace) {
        const imagenes = [...saved];
        if (files.length && canUpload()) for (const f of files) imagenes.push(await uploadImage(f));
        const { next, added } = mergeWorkouts(existing, recs, imagenes, res?.dispositivo);
        onReplace(next);
        toast(`${added} ${added === 1 ? 'registro leído' : 'registros leídos'}: revísalos`);
        onClose();
        return;
      }
      // Un solo registro: el entreno con el mismo nombre o, si no, el primero.
      const want = (extra.actividad || '').toLowerCase();
      const r = recs.find((x) => want && x.actividad.toLowerCase() === want) || recs[0];
      const next = { ...vals };
      for (const f of FIELDS) if (r[f.key] != null) next[f.key] = String(r[f.key]);
      setVals(next);
      const actividad = r.actividad || extra.actividad;
      setExtra({ actividad, hora: r.hora || extra.hora, zonasFC: r.zonasFC || extra.zonasFC, dispositivo: res?.dispositivo || extra.dispositivo });
      if (!parte) setParte(guessPart(actividad, existing, r.hora || extra.hora));
      toast(recs.length > 1 ? `La captura tiene ${recs.length} entrenos: se tomó ${actividad || 'el primero'}` : 'Datos leídos: revísalos antes de guardar');
    } catch (e) { setErr(e?.code === 'asset_fetch' ? 'No se pudo abrir la captura guardada. Vuelve a elegirla.' : `${errorCopy(e)}${e?.code ? ` (código: ${e.code})` : ''}`); } finally { setBusy(''); }
  }

  async function save() {
    const out = { ...extra, parte: parte || guessPart(extra.actividad, existing, extra.hora) };
    for (const f of FIELDS) { const n = num(vals[f.key]); if (n != null) out[f.key] = n; }
    const hasValues = FIELDS.some((f) => out[f.key] != null);
    // Si hay captura y Claude puede leerla, primero se lee y se revisa; luego se guarda.
    if (!hasValues && !tried.current && (files.length || saved.length)) { await read(); return; }
    if (!hasValues && !files.length && !saved.length) { setErr('Elige la captura del reloj o escribe al menos la duración o las calorías.'); return; }
    setBusy('save');
    try {
      out.imagenes = [...saved];
      if (files.length) {
        if (!canUpload()) { if (!hasValues) { setErr('En esta vista no se pueden guardar imágenes. Escribe los valores o abre la app desde el navegador.'); setBusy(''); return; } }
        else for (const f of files) out.imagenes.push(await uploadImage(f));
      }
      if (!hasValues) out.pendiente = true; else delete out.pendiente;
      onSave(out);
      toast(hasValues ? 'Datos del reloj guardados' : 'Captura guardada: léela con Claude cuando puedas');
      onClose();
    } catch { setErr('No se pudo guardar la captura. Intenta de nuevo.'); } finally { setBusy(''); }
  }

  const canRead = files.length || saved.length;
  return html`
    <${Sheet} title=${value ? 'Registro del reloj' : 'Agregar registro del reloj'} onClose=${() => { ctl.current?.abort(); onClose(); }}>
      <div class="panel stack-sm">
        <p class="small muted">Captura de “Datos de Entrenos” en la app Salud del iPhone. Claude la lee y rellena el formulario; revisa y guarda. Si trae varios entrenos, crea un registro por cada uno.</p>
        <${FilePick} id="w-files" count=${files.length} onPick=${(fl) => { const sel = fl.slice(0, imgCaps?.maxCount || 4); setFiles(sel); setErr(''); if (sel.length) read(sel); }} />
        ${previews.length ? html`<div class="thumbs">${previews.map((u) => html`<img src=${u} alt="Captura seleccionada" />`)}</div>` : null}
        ${saved.length ? html`<div class="thumbs">${saved.map((id) => html`<img src=${assetUrl(id)} alt="Captura guardada" />`)}</div>` : null}
        ${canRead ? (busy === 'read'
          ? html`<div class="row"><${Thinking} text="Leyendo la captura…" /><button class="btn btn-sm" onClick=${() => ctl.current?.abort()}>Detener</button></div>`
          : html`<button class="btn btn-primary" onClick=${read}><${Icon} name="spark" /> Leer capturas</button>`) : null}
      </div>
      <div class="form-grid">
        <label class="field"><span>Parte de la sesión</span><select id="w-part" class="select" value=${parte} onChange=${(e) => setParte(e.target.value)}>
          <option value="">Elegir…</option>${Object.entries(WATCH_PARTS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></label>
        <label class="field"><span>Actividad en el reloj</span><input id="w-act" class="input" placeholder="Máquinas de musculación" value=${extra.actividad} onInput=${(e) => setExtra({ ...extra, actividad: e.target.value })} /></label>
        <label class="field"><span>Hora de inicio</span><input id="w-time" type="time" class="input" value=${extra.hora} onInput=${(e) => setExtra({ ...extra, hora: e.target.value })} /></label>
        ${FIELDS.map((f) => html`<label class="field"><span>${f.label} (${f.unit})</span><input id=${'w-' + f.key} class="input num" inputmode="decimal" value=${vals[f.key]} onInput=${(e) => setVals({ ...vals, [f.key]: e.target.value })} /></label>`)}
      </div>
      ${extra.zonasFC || value?.zonasFC ? html`<label class="field"><span>Zonas de FC</span><input id="w-zones" class="input" value=${extra.zonasFC} onInput=${(e) => setExtra({ ...extra, zonasFC: e.target.value })} /></label>` : null}
      <p class="xs muted">La app Salud muestra la FC mínima y máxima solo del último entreno. Si quieres la de cada parte, haz la captura al terminar cada una.</p>
      ${err && html`<p class="small" style="color:var(--bad)">${err}</p>`}
      <div class="row">
        <button class="btn btn-primary" disabled=${busy === 'save'} onClick=${save}>${busy === 'save' ? 'Guardando…' : 'Guardar'}</button>
        ${value && html`<button class="btn btn-ghost btn-danger" onClick=${() => { onDelete(); onClose(); }}><${Icon} name="trash" /> Quitar</button>`}
      </div>
    </${Sheet}>`;
}

const ORDER = { cardio: -1, calentamiento: 0, sesion: 1, bloque: 1, otro: 2, enfriamiento: 3 };

// Lee varias capturas del reloj de una vez. Cada captura puede traer varios entrenos (cardio, fuerza,
// enfriamiento…): cada entreno es un registro.
async function readMany(files, list, onProgress) {
  let next = [...list]; let failed = ''; let added = 0;
  for (let i = 0; i < files.length; i++) {
    onProgress(i);
    const imagenes = [];
    try { if (canUpload()) imagenes.push(await uploadImage(files[i])); } catch { /* se guarda sin imagen */ }
    let recs = []; let dispositivo = '';
    try {
      const r = await extractWorkouts([files[i]]);
      recs = (r?.entrenos || []).map(toRecord); dispositivo = r?.dispositivo || '';
    } catch (e) { failed = `${errorCopy(e)}${e?.code ? ` (código: ${e.code})` : ''}`; }
    const m = mergeWorkouts(next, recs, imagenes, dispositivo);
    if (!m.added && !recs.some((r) => FIELDS.some((f) => r[f.key] != null)) && imagenes.length) {
      next = [...next, { imagenes, pendiente: true, parte: guessPart('', next, '') }]; added++; continue;
    }
    next = m.next; added += m.added;
  }
  return { next, failed, added };
}

export function WatchPanel({ session, onSave }) {
  const [open, setOpen] = useState(null); // {index} | {index: -1} para uno nuevo
  const [bulk, setBulk] = useState(null); // {i, total} mientras lee
  const [bulkErr, setBulkErr] = useState('');
  async function onBulk(files) {
    if (!files.length) return;
    setBulkErr(''); setBulk({ i: 0, total: files.length });
    const { next, failed, added } = await readMany(files, list, (i) => setBulk({ i, total: files.length }));
    setBulk(null);
    if (JSON.stringify(next) !== JSON.stringify(list)) onSave(next);
    if (failed) setBulkErr(failed);
    else toast(added ? `${added} ${added === 1 ? 'registro leído' : 'registros leídos'}: revísalos` : 'Datos del reloj actualizados');
  }
  const list = watchRecords(session);
  const sorted = list.map((r, i) => ({ r, i })).sort((a, b) => (ORDER[a.r.parte] ?? 2) - (ORDER[b.r.parte] ?? 2) || (a.r.hora || '').localeCompare(b.r.hora || ''));
  const t = watchTotals(list);
  const save = (next) => onSave(next);
  return html`
    <section class="panel stack-sm">
      <div class="row-between" style="flex-wrap:nowrap;gap:8px">
        <span class="eyebrow">Reloj${list.length > 1 ? ` · ${list.length} registros` : ''}</span>
        <button class="btn btn-sm btn-ghost" onClick=${() => setOpen({ index: -1 })}><${Icon} name="plus" size="16" /> A mano</button>
      </div>
      ${bulk ? html`<${Thinking} text=${`Leyendo captura ${bulk.i + 1} de ${bulk.total}…`} />`
        : html`<${FilePick} id="w-bulk" label="Leer capturas" primary onPick=${onBulk} />`}
      ${bulkErr && html`<p class="small" style="color:var(--bad)">${bulkErr}</p>`}
      ${t ? html`
        <div class="watch-kpis">${FIELDS.filter((f) => t[f.key] != null).map((f) => html`
          <div><span class="xs muted">${f.label}${list.length > 1 ? (f.key === 'fcMax' || f.key === 'fcMin' ? '' : f.key === 'fcMedia' ? ' (prom.)' : ' (total)') : ''}</span><b class="num">${f.key === 'duracionMin' ? fmtClock(t[f.key] * 60) : fmtNum(t[f.key], 0)}</b>${f.key === 'duracionMin' ? null : html`<small class="muted"> ${f.unit}</small>`}</div>`)}</div>` : null}
      ${list.length ? html`<div class="mlist">${sorted.map(({ r, i }) => html`
        <button class="mrow" style="grid-template-columns:1fr auto" onClick=${() => setOpen({ index: i })}>
          <span><span class="name">${WATCH_PARTS[r.parte] || 'Registro'}${r.actividad ? ` · ${r.actividad}` : ''}</span><br />
            <span class="xs muted num">${r.pendiente ? 'Captura guardada sin leer: tócala para leerla con Claude' : `${r.hora ? `${r.hora} · ` : ''}${summary(r)}`}</span></span>
          <${Icon} name="chevron" />
        </button>`)}</div>`
      : html`<p class="small muted">Al terminar, abre la app Salud del iPhone → “Datos de Entrenos” y elige la captura. Claude crea un registro por cada entreno (elíptica, fuerza, enfriamiento…) y le pone la FC al último.</p>`}
      ${open && html`<${WatchSheet} value=${open.index >= 0 ? list[open.index] : null} existing=${list.filter((_, j) => j !== open.index)}
        onSave=${(r) => save(open.index >= 0 ? list.map((x, j) => (j === open.index ? r : x)) : [...list, r])}
        onReplace=${(rest) => save(rest)}
        onDelete=${() => save(list.filter((_, j) => j !== open.index))}
        onClose=${() => setOpen(null)} />`}
    </section>`;
}
