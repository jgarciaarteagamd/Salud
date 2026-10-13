// Datos del reloj para una sesión de Forus o Freeletics. Una sesión puede tener varios registros del
// Galaxy Watch (p. ej. "Estiramientos" al calentar, "Máquinas de musculación" en el bloque y "Estiramientos"
// al final): cada uno con duración, calorías, frecuencia cardiaca y zonas, leídos de la captura de Samsung Health.
import { uploadImage, canUpload, assetUrl, blobsFromAssets } from '../store.js';
import { extractActivity, imageLimits, errorCopy } from '../ai.js';
import { fmtClock } from '../fields.js';
import { fmtNum, num } from '../stats.js';
import { Icon, Sheet, Thinking, toast, FilePick } from '../ui.js';
const { html, useState, useEffect, useRef } = window.htmPreact;

const FIELDS = [
  { key: 'duracionMin', label: 'Duración', unit: 'min' },
  { key: 'kcal', label: 'Calorías', unit: 'kcal' },
  { key: 'fcMedia', label: 'FC media', unit: 'lpm' },
  { key: 'fcMax', label: 'FC máxima', unit: 'lpm' },
];
export const WATCH_PARTS = {
  calentamiento: 'Calentamiento', bloque: 'Bloque principal', enfriamiento: 'Vuelta a la calma', sesion: 'Toda la sesión', otro: 'Otro',
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
  return { duracionMin: dur || null, kcal: kcal || null, fcMedia, fcMax };
}

const summary = (r) => [r.duracionMin && fmtClock(r.duracionMin * 60), r.kcal && `${fmtNum(r.kcal, 0)} kcal`, r.fcMedia && `FC ${fmtNum(r.fcMedia, 0)}`, r.fcMax && `máx ${fmtNum(r.fcMax, 0)}`].filter(Boolean).join(' · ');
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
  if (/estiramiento|movilidad|yoga|el[ií]ptica|caminata|bicicleta|cinta/.test(a)) return before ? 'calentamiento' : 'enfriamiento';
  if (/m[aá]quinas|musculaci|pesas|fuerza|circuito/.test(a)) return existing.length ? 'bloque' : 'sesion';
  return existing.length ? 'otro' : 'sesion';
}

function WatchSheet({ value, existing, onSave, onDelete, onClose }) {
  const [vals, setVals] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, value?.[f.key] != null ? String(value[f.key]) : ''])));
  const [extra, setExtra] = useState({ actividad: value?.actividad || '', hora: value?.hora || '', zonasFC: value?.zonasFC || '', dispositivo: value?.dispositivo || '' });
  const [parte, setParte] = useState(value?.parte || '');
  const [files, setFiles] = useState([]); const [previews, setPreviews] = useState([]);
  const [imgCaps, setImgCaps] = useState(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const ctl = useRef(null);
  useEffect(() => { imageLimits().then(setImgCaps); }, []);
  useEffect(() => { const u = files.map((f) => URL.createObjectURL(f)); setPreviews(u); return () => u.forEach((x) => URL.revokeObjectURL(x)); }, [files]);
  const saved = value?.imagenes || [];

  async function read() {
    setBusy('read'); setErr(''); ctl.current = new AbortController();
    try {
      const imgs = files.length ? files : await blobsFromAssets(saved);
      const r = await extractActivity(imgs, { signal: ctl.current.signal });
      const next = { ...vals };
      for (const f of FIELDS) if (num(r?.valores?.[f.key]) != null) next[f.key] = String(num(r.valores[f.key]));
      setVals(next);
      const actividad = r?.actividad || extra.actividad;
      setExtra({ actividad, hora: r?.hora || extra.hora, zonasFC: r?.zonasFC || extra.zonasFC, dispositivo: r?.dispositivo || extra.dispositivo });
      if (!parte) setParte(guessPart(actividad, existing, r?.hora || extra.hora));
      toast('Datos leídos: revísalos antes de guardar');
    } catch (e) { setErr(e?.code === 'asset_fetch' ? 'No se pudo abrir la captura guardada. Vuelve a elegirla.' : errorCopy(e)); } finally { setBusy(''); }
  }

  async function save() {
    const out = { ...extra, parte: parte || guessPart(extra.actividad, existing, extra.hora) };
    for (const f of FIELDS) { const n = num(vals[f.key]); if (n != null) out[f.key] = n; }
    const hasValues = FIELDS.some((f) => out[f.key] != null);
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

  const canRead = imgCaps && (files.length || saved.length);
  return html`
    <${Sheet} title=${value ? 'Registro del reloj' : 'Agregar registro del reloj'} onClose=${() => { ctl.current?.abort(); onClose(); }}>
      <div class="panel stack-sm">
        <p class="small muted">Captura del resumen del entrenamiento en Samsung Health.${imgCaps ? ' Claude leerá los datos.' : ' En esta vista Claude no puede leer imágenes: guárdala y léela después desde el navegador, o escribe los valores.'}</p>
        <${FilePick} id="w-files" count=${files.length} onPick=${(fl) => { setFiles(fl.slice(0, imgCaps?.maxCount || 4)); setErr(''); }} />
        ${previews.length ? html`<div class="thumbs">${previews.map((u) => html`<img src=${u} alt="Captura seleccionada" />`)}</div>` : null}
        ${saved.length ? html`<div class="thumbs">${saved.map((id) => html`<img src=${assetUrl(id)} alt="Captura guardada" />`)}</div>` : null}
        ${canRead ? (busy === 'read'
          ? html`<div class="row"><${Thinking} text="Leyendo la captura…" /><button class="btn btn-sm" onClick=${() => ctl.current?.abort()}>Detener</button></div>`
          : html`<button class="btn btn-primary" onClick=${read}><${Icon} name="spark" /> Leer con Claude</button>`) : null}
      </div>
      <div class="form-grid">
        <label class="field"><span>Parte de la sesión</span><select id="w-part" class="select" value=${parte} onChange=${(e) => setParte(e.target.value)}>
          <option value="">Elegir…</option>${Object.entries(WATCH_PARTS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></label>
        <label class="field"><span>Actividad en el reloj</span><input id="w-act" class="input" placeholder="Máquinas de musculación" value=${extra.actividad} onInput=${(e) => setExtra({ ...extra, actividad: e.target.value })} /></label>
        <label class="field"><span>Hora de inicio</span><input id="w-time" type="time" class="input" value=${extra.hora} onInput=${(e) => setExtra({ ...extra, hora: e.target.value })} /></label>
        ${FIELDS.map((f) => html`<label class="field"><span>${f.label} (${f.unit})</span><input id=${'w-' + f.key} class="input num" inputmode="decimal" value=${vals[f.key]} onInput=${(e) => setVals({ ...vals, [f.key]: e.target.value })} /></label>`)}
      </div>
      <label class="field"><span>Zonas de FC</span><input id="w-zones" class="input" placeholder="Casi todo en zona 1, picos en zona 2" value=${extra.zonasFC} onInput=${(e) => setExtra({ ...extra, zonasFC: e.target.value })} /></label>
      ${err && html`<p class="small" style="color:var(--bad)">${err}</p>`}
      <div class="row">
        <button class="btn btn-primary" disabled=${busy === 'save'} onClick=${save}>${busy === 'save' ? 'Guardando…' : 'Guardar'}</button>
        ${value && html`<button class="btn btn-ghost btn-danger" onClick=${() => { onDelete(); onClose(); }}><${Icon} name="trash" /> Quitar</button>`}
      </div>
    </${Sheet}>`;
}

const ORDER = { calentamiento: 0, sesion: 1, bloque: 1, otro: 2, enfriamiento: 3 };

export function WatchPanel({ session, onSave }) {
  const [open, setOpen] = useState(null); // {index} | {index: -1} para uno nuevo
  const list = watchRecords(session);
  const sorted = list.map((r, i) => ({ r, i })).sort((a, b) => (ORDER[a.r.parte] ?? 2) - (ORDER[b.r.parte] ?? 2) || (a.r.hora || '').localeCompare(b.r.hora || ''));
  const t = watchTotals(list);
  const save = (next) => onSave(next);
  return html`
    <section class="panel stack-sm">
      <div class="row-between" style="flex-wrap:nowrap;gap:8px">
        <span class="eyebrow">Reloj${list.length > 1 ? ` · ${list.length} registros` : ''}</span>
        <button class="btn btn-sm" onClick=${() => setOpen({ index: -1 })}><${Icon} name=${list.length ? 'plus' : 'camera'} size="16" /> ${list.length ? 'Agregar' : 'Subir resumen'}</button>
      </div>
      ${t ? html`
        <div class="watch-kpis">${FIELDS.filter((f) => t[f.key] != null).map((f) => html`
          <div><span class="xs muted">${f.label}${list.length > 1 ? (f.key === 'fcMax' ? '' : f.key === 'fcMedia' ? ' (prom.)' : ' (total)') : ''}</span><b class="num">${f.key === 'duracionMin' ? fmtClock(t[f.key] * 60) : fmtNum(t[f.key], 0)}</b>${f.key === 'duracionMin' ? null : html`<small class="muted"> ${f.unit}</small>`}</div>`)}</div>` : null}
      ${list.length ? html`<div class="mlist">${sorted.map(({ r, i }) => html`
        <button class="mrow" style="grid-template-columns:1fr auto" onClick=${() => setOpen({ index: i })}>
          <span><span class="name">${WATCH_PARTS[r.parte] || 'Registro'}${r.actividad ? ` · ${r.actividad}` : ''}</span><br />
            <span class="xs muted num">${r.pendiente ? 'Captura guardada sin leer: tócala para leerla con Claude' : `${r.hora ? `${r.hora} · ` : ''}${summary(r)}`}</span></span>
          <${Icon} name="chevron" />
        </button>`)}</div>`
      : html`<p class="small muted">Al terminar, sube las capturas del resumen de tu Galaxy Watch. Si registraste calentamiento, bloque y vuelta a la calma por separado, agrega cada una.</p>`}
      ${open && html`<${WatchSheet} value=${open.index >= 0 ? list[open.index] : null} existing=${list.filter((_, j) => j !== open.index)}
        onSave=${(r) => save(open.index >= 0 ? list.map((x, j) => (j === open.index ? r : x)) : [...list, r])}
        onDelete=${() => save(list.filter((_, j) => j !== open.index))}
        onClose=${() => setOpen(null)} />`}
    </section>`;
}
