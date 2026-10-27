// Cardio y otras actividades (natación, caminata, bicicleta…): se registran desde la captura de
// la app Salud del iPhone (Apple Watch) que Claude lee, o a mano. No suman series de fuerza, pero el plan las tiene en cuenta.
import { saveDoc, deleteDoc, newId, uploadImage, canUpload, assetUrl, blobsFromAssets } from '../store.js';
import { ACTIVITY_TYPES, ACTIVITY_FIELDS, paceLabel, fmtClock } from '../fields.js';
import { extractActivity, imageLimits, errorCopy } from '../ai.js';
import { todayKey, fmtDay, fmtNum, num, parseDay, DIAS_CORTOS } from '../stats.js';
import { Icon, Sheet, Thinking, Confirm, toast, FilePick } from '../ui.js';
const { html, useState, useEffect, useRef } = window.htmPreact;

const SHOWN = {
  natacion: ['distancia', 'duracionMin', 'activoMin', 'fcMin', 'fcMax', 'fcMedia', 'kcal', 'brazadas', 'swolf', 'largoPiscina'],
  caminata: ['distancia', 'duracionMin', 'activoMin', 'fcMin', 'fcMax', 'fcMedia', 'kcal', 'pasos'],
  carrera: ['distancia', 'duracionMin', 'activoMin', 'fcMin', 'fcMax', 'fcMedia', 'kcal', 'pasos'],
};
const fieldsFor = (tipo) => { const keys = SHOWN[tipo] || ['duracionMin', 'kcal', 'fcMin', 'fcMax', 'fcMedia', 'distancia', 'activoMin']; return keys.map((k) => ACTIVITY_FIELDS.find((f) => f.key === k)); };

export function activityTitle(a) {
  const d = num(a.valores?.distancia);
  return `${ACTIVITY_TYPES[a.tipo] || 'Actividad'}${d ? ` · ${d >= 1000 ? `${fmtNum(d / 1000, 2)} km` : `${fmtNum(d, 0)} m`}` : ''}`;
}
export function activitySubtitle(a) {
  if (a.pendiente) return 'Captura sin leer: ábrela y toca “Leer con Claude”';
  const v = a.valores || {};
  const fc = v.fcMedia ? `${fmtNum(v.fcMedia, 0)} lpm` : v.fcMin && v.fcMax ? `FC ${fmtNum(v.fcMin, 0)}–${fmtNum(v.fcMax, 0)}` : null;
  return [v.duracionMin && fmtClock(v.duracionMin * 60), paceLabel(a), fc, v.kcal && `${fmtNum(v.kcal, 0)} kcal`].filter(Boolean).join(' · ');
}

export function ActivitySheet({ entry, onClose }) {
  const [date, setDate] = useState(entry?.date || todayKey());
  const [hora, setHora] = useState(entry?.hora || '');
  const [tipo, setTipo] = useState(entry?.tipo || 'natacion');
  const [lugar, setLugar] = useState(entry?.lugar || '');
  const [vals, setVals] = useState(() => Object.fromEntries(Object.entries(entry?.valores || {}).map(([k, v]) => [k, String(v)])));
  const [largos, setLargos] = useState(entry?.largos || []);
  const [extra, setExtra] = useState({ ritmo: entry?.ritmo || '', zonasFC: entry?.zonasFC || '', dispositivo: entry?.dispositivo || '' });
  const [notas, setNotas] = useState(entry?.notas || '');
  const [files, setFiles] = useState([]); const [previews, setPreviews] = useState([]);
  const [imgCaps, setImgCaps] = useState(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [summary, setSummary] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const ctl = useRef(null);

  useEffect(() => { imageLimits().then(setImgCaps); }, []);
  // Captura guardada sin leer: se lee sola al abrirla en una vista que puede leer imágenes.
  useEffect(() => { if (entry?.pendiente && entry?.imagenes?.length) read(); }, []);
  const tried = useRef(false);
  useEffect(() => { const urls = files.map((f) => URL.createObjectURL(f)); setPreviews(urls); return () => urls.forEach((u) => URL.revokeObjectURL(u)); }, [files]);

  // Las capturas recién elegidas o, si no hay, las ya guardadas en el registro.
  const pickImgs = () => (files.length ? files : blobsFromAssets(entry?.imagenes || []));
  async function read(override) {
    tried.current = true;
    setBusy('read'); setErr(''); ctl.current = new AbortController();
    try {
      const r = await extractActivity((override || await pickImgs()), { signal: ctl.current.signal });
      const next = { ...vals };
      for (const [k, v] of Object.entries(r?.valores || {})) if (ACTIVITY_FIELDS.some((f) => f.key === k) && num(v) != null) next[k] = String(num(v));
      setVals(next);
      if (r?.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) setDate(r.fecha);
      if (r?.hora && /^\d{1,2}:\d{2}$/.test(r.hora)) setHora(r.hora.padStart(5, '0'));
      if (r?.tipo && ACTIVITY_TYPES[r.tipo]) setTipo(r.tipo);
      if (r?.lugar) setLugar(r.lugar);
      if (Array.isArray(r?.largos) && r.largos.length) setLargos(r.largos.map((l, i) => ({ n: l.n || i + 1, distancia: l.distancia ?? null, tiempo: l.tiempo || '', ritmo: l.ritmo || '', descanso: l.descanso || '', estilo: l.estilo || '' })));
      setExtra({ ritmo: r?.ritmo || extra.ritmo, zonasFC: r?.zonasFC || extra.zonasFC, dispositivo: r?.dispositivo || extra.dispositivo });
      setSummary(r?.resumen || '');
      toast('Datos leídos: revísalos antes de guardar');
    } catch (e) { setErr(e?.code === 'asset_fetch' ? 'No se pudo abrir la captura guardada. Vuelve a elegirla.' : `${errorCopy(e)}${e?.code ? ` (código: ${e.code})` : ''}`); } finally { setBusy(''); }
  }

  async function save() {
    const valores = {};
    for (const f of ACTIVITY_FIELDS) { const n = num(vals[f.key]); if (n != null) valores[f.key] = n; }
    const hasValues = Object.keys(valores).length > 0;
    // Si hay captura y Claude puede leerla, primero se lee y se revisa; luego se guarda.
    if (!hasValues && !tried.current && (files.length || entry?.imagenes?.length)) { await read(); return; }
    // Sin valores se puede guardar solo la captura, para leerla después con Claude.
    if (!hasValues && !files.length && !entry?.imagenes?.length) { setErr('Elige una captura o escribe al menos un valor.'); return; }
    if (!hasValues && files.length && !canUpload()) { setErr('En esta vista no se pueden guardar imágenes. Escribe los valores o abre la app desde el navegador.'); return; }
    setBusy('save');
    try {
      const imagenes = [...(entry?.imagenes || [])];
      if (files.length && canUpload()) for (const f of files) imagenes.push(await uploadImage(f));
      const doc = {
        ...(entry || {}), date, hora, tipo, lugar, valores, notas, imagenes,
        largos: largos.filter((l) => l.tiempo), ...extra, fuente: entry?.fuente || 'reloj',
        createdAt: entry?.createdAt || new Date().toISOString(), pendiente: !hasValues,
      };
      await saveDoc('activities', entry?.id || newId('a'), doc);
      toast(hasValues ? 'Actividad guardada' : 'Captura guardada: léela con Claude cuando puedas');
      onClose();
    } catch (e) { setErr(e?.code === 'quota_or_state' ? 'No queda espacio para imágenes. Guarda sin captura.' : 'No se pudo guardar. Intenta de nuevo.'); } finally { setBusy(''); }
  }

  const setLargo = (i, k, v) => setLargos(largos.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return html`
    <${Sheet} title=${entry ? 'Editar cardio' : 'Cardio'} onClose=${() => { ctl.current?.abort(); onClose(); }}>
      <div class="form-grid">
        <label class="field"><span>Actividad</span><select id="ac-type" class="select" value=${tipo} onChange=${(e) => setTipo(e.target.value)}>${Object.entries(ACTIVITY_TYPES).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></label>
        <label class="field"><span>Lugar</span><input id="ac-place" class="input" placeholder=${tipo === 'natacion' ? 'Piscina' : 'Parque, cinta…'} value=${lugar} onInput=${(e) => setLugar(e.target.value)} /></label>
        <label class="field"><span>Fecha</span><input id="ac-date" type="date" class="input" value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
        <label class="field"><span>Hora</span><input id="ac-time" type="time" class="input" value=${hora} onInput=${(e) => setHora(e.target.value)} /></label>
      </div>

      <div class="panel stack-sm">
        <span class="eyebrow">Capturas de Fitness o Salud</span>
        <p class="small muted">Sube la tarjeta del entreno en la app Fitness del iPhone (y, si quieres, su detalle con FC, largos o ritmo). También sirve “Datos de Entrenos” de la app Salud. Claude la lee y rellena el formulario; revisa y guarda.</p>
        <${FilePick} id="ac-files" count=${files.length} onPick=${(fl) => { const sel = fl.slice(0, imgCaps?.maxCount || 6); setFiles(sel); setErr(''); if (sel.length) read(sel); }} />
        ${previews.length ? html`<div class="thumbs">${previews.map((u) => html`<img src=${u} alt="Captura seleccionada" />`)}</div>` : null}
        ${entry?.imagenes?.length ? html`<div class="thumbs">${entry.imagenes.map((id) => html`<img src=${assetUrl(id)} alt="Captura guardada" />`)}</div>` : null}
        ${(files.length || entry?.imagenes?.length) ? (busy === 'read'
          ? html`<div class="row"><${Thinking} text="Leyendo la captura…" /><button class="btn btn-sm" onClick=${() => ctl.current?.abort()}>Detener</button></div>`
          : html`<button class="btn btn-primary" onClick=${read}><${Icon} name="spark" /> Leer capturas</button>`) : null}
        ${summary && html`<p class="small">${summary}</p>`}
      </div>

      <div class="form-grid">${fieldsFor(tipo).map((f) => html`
        <label class="field"><span>${f.label}${f.unit ? ` (${f.unit})` : ''}</span>
          <input id=${'av-' + f.key} class="input num" inputmode="decimal" value=${vals[f.key] ?? ''} onInput=${(e) => setVals({ ...vals, [f.key]: e.target.value })} /></label>`)}
      </div>
      ${paceLabel({ tipo, valores: { distancia: num(vals.distancia), duracionMin: num(vals.duracionMin), activoMin: num(vals.activoMin) } })
        ? html`<p class="small muted">Ritmo calculado: <b>${paceLabel({ tipo, valores: { distancia: num(vals.distancia), duracionMin: num(vals.duracionMin), activoMin: num(vals.activoMin) } })}</b>${extra.ritmo ? ` · el reloj marca ${extra.ritmo}` : ''}</p>` : null}

      ${tipo === 'natacion' || largos.length ? html`
        <div class="stack-sm">
          <div class="row-between"><span class="eyebrow">Largos o vueltas</span>
            <button class="btn btn-ghost btn-sm" onClick=${() => setLargos([...largos, { n: largos.length + 1, distancia: num(vals.largoPiscina) || 25, tiempo: '', descanso: '', estilo: largos[largos.length - 1]?.estilo || 'Libre' }])}><${Icon} name="plus" size="16" /> Largo</button></div>
          ${largos.length ? html`<div class="mtable-wrap"><table class="mtable splits">
            <thead><tr><th>#</th><th>Tiempo</th><th>Descanso</th><th>Estilo</th><th></th></tr></thead>
            <tbody>${largos.map((l, i) => html`<tr>
              <td>${i + 1}</td>
              <td><input class="input num" aria-label=${`Tiempo del largo ${i + 1}`} value=${l.tiempo} placeholder="00:52.3" onInput=${(e) => setLargo(i, 'tiempo', e.target.value)} /></td>
              <td><input class="input num" aria-label=${`Descanso después del largo ${i + 1}`} value=${l.descanso || ''} placeholder="—" onInput=${(e) => setLargo(i, 'descanso', e.target.value)} /></td>
              <td><input class="input" aria-label=${`Estilo del largo ${i + 1}`} value=${l.estilo || ''} onInput=${(e) => setLargo(i, 'estilo', e.target.value)} /></td>
              <td><button class="icon-btn" aria-label="Quitar largo" onClick=${() => setLargos(largos.filter((_, j) => j !== i).map((x, j) => ({ ...x, n: j + 1 })))}><${Icon} name="x" size="16" /></button></td>
            </tr>`)}</tbody></table></div>` : html`<p class="small muted">Opcional: el tiempo de cada largo y el descanso entre ellos.</p>`}
        </div>` : null}

      <div class="form-grid">
        <label class="field"><span>Zonas de FC</span><input id="ac-zones" class="input" placeholder="Casi todo en zona 1-2" value=${extra.zonasFC} onInput=${(e) => setExtra({ ...extra, zonasFC: e.target.value })} /></label>
        <label class="field"><span>Dispositivo</span><input id="ac-device" class="input" placeholder="Apple Watch" value=${extra.dispositivo} onInput=${(e) => setExtra({ ...extra, dispositivo: e.target.value })} /></label>
      </div>
      <label class="field"><span>Notas (cómo te sentiste, rodilla, espalda, hombros)</span><textarea id="ac-notes" class="textarea" style="min-height:64px" value=${notas} onInput=${(e) => setNotas(e.target.value)}></textarea></label>
      ${err && html`<p class="small" style="color:var(--bad)">${err}</p>`}
      <div class="row">
        <button class="btn btn-primary" disabled=${busy === 'save'} onClick=${save}>${busy === 'save' ? 'Guardando…' : 'Guardar actividad'}</button>
        ${entry && html`<button class="btn btn-ghost btn-danger" onClick=${() => setConfirmDel(true)}><${Icon} name="trash" /> Eliminar</button>`}
      </div>
      ${confirmDel && html`<${Confirm} title="Eliminar actividad" text=${`Se borra ${activityTitle(entry).toLowerCase()} del ${fmtDay(entry.date)}.`} onConfirm=${async () => { await deleteDoc('activities', entry.id); toast('Actividad eliminada'); onClose(); }} onClose=${() => setConfirmDel(false)} />`}
    </${Sheet}>`;
}

// Tarjeta para el historial.
export function ActivityCard({ a, onOpen }) {
  const d = parseDay(a.date);
  return html`
    <button class="card hcard" onClick=${onOpen}>
      <div class="hdate cardio"><b>${d.getDate()}</b><span>${DIAS_CORTOS[d.getDay()]}</span></div>
      <div class="stack-sm" style="gap:4px;min-width:0">
        <b style="font-family:var(--f-display);font-size:1.15rem;font-weight:600">${activityTitle(a)}</b>
        <span class="xs muted num">${activitySubtitle(a)}</span>
        <div class="chips"><span class="chip cardio"><${Icon} name="swim" size="14" /> Cardio</span>${a.lugar ? html`<span class="chip">${a.lugar}</span>` : null}${a.largos?.length ? html`<span class="chip">${a.largos.length} largos</span>` : null}</div>
      </div>
      <${Icon} name="chevron" />
    </button>`;
}
