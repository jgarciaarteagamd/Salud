// Datos del reloj para una sesión de Forus o Freeletics: duración, calorías, frecuencia cardiaca y zonas,
// leídos de la captura del resumen de Samsung Health ("Circuito entrenamiento", "Máquinas de musculación"…).
import { uploadImage, canUpload, assetUrl } from '../store.js';
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

export function watchSummary(r) {
  if (!r) return '';
  return [r.duracionMin && fmtClock(r.duracionMin * 60), r.kcal && `${fmtNum(r.kcal, 0)} kcal`, r.fcMedia && `FC ${fmtNum(r.fcMedia, 0)}`, r.fcMax && `máx ${fmtNum(r.fcMax, 0)}`].filter(Boolean).join(' · ');
}

function WatchSheet({ value, onSave, onClose }) {
  const [vals, setVals] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, value?.[f.key] != null ? String(value[f.key]) : ''])));
  const [extra, setExtra] = useState({ actividad: value?.actividad || '', hora: value?.hora || '', zonasFC: value?.zonasFC || '', dispositivo: value?.dispositivo || '' });
  const [files, setFiles] = useState([]); const [previews, setPreviews] = useState([]);
  const [imgCaps, setImgCaps] = useState(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const ctl = useRef(null);
  useEffect(() => { imageLimits().then(setImgCaps); }, []);
  useEffect(() => { const u = files.map((f) => URL.createObjectURL(f)); setPreviews(u); return () => u.forEach((x) => URL.revokeObjectURL(x)); }, [files]);

  async function read() {
    setBusy('read'); setErr(''); ctl.current = new AbortController();
    try {
      const r = await extractActivity(files, { signal: ctl.current.signal });
      const next = { ...vals };
      for (const f of FIELDS) if (num(r?.valores?.[f.key]) != null) next[f.key] = String(num(r.valores[f.key]));
      setVals(next);
      setExtra({
        actividad: r?.actividad || extra.actividad, hora: r?.hora || extra.hora,
        zonasFC: r?.zonasFC || extra.zonasFC, dispositivo: r?.dispositivo || extra.dispositivo,
      });
      toast('Datos leídos: revísalos antes de guardar');
    } catch (e) { setErr(errorCopy(e)); } finally { setBusy(''); }
  }

  async function save() {
    const out = { ...extra };
    for (const f of FIELDS) { const n = num(vals[f.key]); if (n != null) out[f.key] = n; }
    if (!FIELDS.some((f) => out[f.key] != null)) { setErr('Agrega al menos la duración o las calorías.'); return; }
    setBusy('save');
    try {
      out.imagenes = [...(value?.imagenes || [])];
      if (files.length && canUpload()) for (const f of files) out.imagenes.push(await uploadImage(f));
      onSave(out);
      onClose();
    } catch { setErr('No se pudo guardar la captura. Intenta sin imagen.'); } finally { setBusy(''); }
  }

  return html`
    <${Sheet} title="Datos del reloj" onClose=${() => { ctl.current?.abort(); onClose(); }}>
      <div class="panel stack-sm">
        <p class="small muted">Sube la captura del resumen del entrenamiento en Samsung Health.${imgCaps ? ' Claude leerá los datos.' : ' En esta vista Claude no puede leer imágenes; llena los valores a mano.'}</p>
        <${FilePick} id="w-files" count=${files.length} onPick=${(fl) => { setFiles(fl.slice(0, imgCaps?.maxCount || 4)); setErr(''); }} />
        ${previews.length ? html`<div class="thumbs">${previews.map((u) => html`<img src=${u} alt="Captura seleccionada" />`)}</div>` : null}
        ${value?.imagenes?.length ? html`<div class="thumbs">${value.imagenes.map((id) => html`<img src=${assetUrl(id)} alt="Captura guardada" />`)}</div>` : null}
        ${files.length && imgCaps ? (busy === 'read'
          ? html`<div class="row"><${Thinking} text="Leyendo la captura…" /><button class="btn btn-sm" onClick=${() => ctl.current?.abort()}>Detener</button></div>`
          : html`<button class="btn btn-primary" onClick=${read}><${Icon} name="spark" /> Leer con Claude</button>`) : null}
      </div>
      <div class="form-grid">
        <label class="field"><span>Actividad en el reloj</span><input id="w-act" class="input" placeholder="Circuito entrenamiento" value=${extra.actividad} onInput=${(e) => setExtra({ ...extra, actividad: e.target.value })} /></label>
        <label class="field"><span>Hora de inicio</span><input id="w-time" type="time" class="input" value=${extra.hora} onInput=${(e) => setExtra({ ...extra, hora: e.target.value })} /></label>
        ${FIELDS.map((f) => html`<label class="field"><span>${f.label} (${f.unit})</span><input id=${'w-' + f.key} class="input num" inputmode="decimal" value=${vals[f.key]} onInput=${(e) => setVals({ ...vals, [f.key]: e.target.value })} /></label>`)}
      </div>
      <label class="field"><span>Zonas de FC</span><input id="w-zones" class="input" placeholder="Casi todo en zona 1, picos en zona 2" value=${extra.zonasFC} onInput=${(e) => setExtra({ ...extra, zonasFC: e.target.value })} /></label>
      ${err && html`<p class="small" style="color:var(--bad)">${err}</p>`}
      <div class="row">
        <button class="btn btn-primary" disabled=${busy === 'save'} onClick=${save}>${busy === 'save' ? 'Guardando…' : 'Guardar datos del reloj'}</button>
        ${value && html`<button class="btn btn-ghost btn-danger" onClick=${() => { onSave(null); onClose(); }}><${Icon} name="trash" /> Quitar</button>`}
      </div>
    </${Sheet}>`;
}

export function WatchPanel({ session, onSave }) {
  const [open, setOpen] = useState(false);
  const r = session.reloj;
  return html`
    <section class="panel stack-sm">
      <div class="row-between" style="flex-wrap:nowrap;gap:8px">
        <span class="eyebrow">Reloj${r?.actividad ? ` · ${r.actividad}` : ''}</span>
        <button class="btn btn-sm" onClick=${() => setOpen(true)}><${Icon} name=${r ? 'edit' : 'camera'} size="16" /> ${r ? 'Editar' : 'Subir resumen'}</button>
      </div>
      ${r ? html`
        <div class="watch-kpis">${FIELDS.filter((f) => r[f.key] != null).map((f) => html`
          <div><span class="xs muted">${f.label}</span><b class="num">${f.key === 'duracionMin' ? fmtClock(r[f.key] * 60) : fmtNum(r[f.key], 0)}</b>${f.key === 'duracionMin' ? null : html`<small class="muted"> ${f.unit}</small>`}</div>`)}</div>
        ${r.zonasFC ? html`<p class="xs muted">Zonas: ${r.zonasFC}</p>` : null}`
      : html`<p class="small muted">Al terminar, sube la captura del resumen de tu Galaxy Watch: duración, calorías y frecuencia cardiaca quedan junto a la sesión.</p>`}
      ${open && html`<${WatchSheet} value=${r} onSave=${onSave} onClose=${() => setOpen(false)} />`}
    </section>`;
}
