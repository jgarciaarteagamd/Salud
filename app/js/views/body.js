// Cuerpo: medidas (antropometría, bioimpedancia, Samsung Watch) y nutrición (Fitia).
// Cada registro se crea desde capturas que Claude lee, o a mano; siempre se revisa antes de guardar.
import { useStore, saveDoc, deleteDoc, newId, uploadImage, canUpload, assetUrl } from '../store.js';
import { MEASURE_GROUPS, MEASURE_FIELDS, MEASURE_TYPES, NUTRITION_FIELDS, mergeMeasurementsByDate, SOURCE_SHORT } from '../fields.js';
import { extractMeasurements, extractNutrition, imageLimits, errorCopy } from '../ai.js';
import { todayKey, fmtShort, fmtDay, fmtNum, num, addDays, dateKey } from '../stats.js';
import { Icon, Sheet, LineChart, Thinking, Confirm, toast } from '../ui.js';
const { html, useState, useEffect, useMemo, useRef } = window.htmPreact;

function EntrySheet({ kind, entry, onClose }) {
  const isNut = kind === 'nutrition';
  const [date, setDate] = useState(entry?.date || todayKey());
  const [tipo, setTipo] = useState(entry?.tipo || 'bioimpedancia');
  const [vals, setVals] = useState(() => Object.fromEntries(Object.entries(entry?.valores || {}).map(([k, v]) => [k, String(v)])));
  const [notas, setNotas] = useState(entry?.notas || '');
  const [otros, setOtros] = useState(entry?.otros || []);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [imgCaps, setImgCaps] = useState(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [summary, setSummary] = useState('');
  const [showAll, setShowAll] = useState(!entry && false);
  const [confirmDel, setConfirmDel] = useState(false);
  const ctl = useRef(null);
  const fields = isNut ? NUTRITION_FIELDS : MEASURE_FIELDS;

  useEffect(() => { imageLimits().then(setImgCaps); }, []);
  useEffect(() => { const urls = files.map((f) => URL.createObjectURL(f)); setPreviews(urls); return () => urls.forEach((u) => URL.revokeObjectURL(u)); }, [files]);

  const pick = (e) => { const fl = [...(e.target.files || [])].slice(0, imgCaps?.maxCount || 6); setFiles(fl); setErr(''); };

  async function read() {
    if (!files.length) return;
    setBusy('read'); setErr(''); ctl.current = new AbortController();
    try {
      const r = isNut ? await extractNutrition(files, { signal: ctl.current.signal })
        : await extractMeasurements(files, MEASURE_TYPES[tipo], { signal: ctl.current.signal });
      const next = { ...vals };
      for (const [k, v] of Object.entries(r?.valores || {})) if (fields.some((f) => f.key === k) && num(v) != null) next[k] = String(num(v));
      setVals(next);
      if (r?.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) setDate(r.fecha);
      if (!isNut && r?.tipo && MEASURE_TYPES[r.tipo]) setTipo(r.tipo);
      if (Array.isArray(r?.otros)) setOtros(r.otros.filter((o) => o?.nombre));
      setSummary(r?.resumen || '');
      toast('Valores leídos: revísalos antes de guardar');
    } catch (e) { setErr(errorCopy(e)); } finally { setBusy(''); }
  }

  async function save() {
    const valores = {};
    for (const f of fields) { const n = num(vals[f.key]); if (n != null) valores[f.key] = n; }
    if (!Object.keys(valores).length) { setErr('Agrega al menos un valor.'); return; }
    setBusy('save');
    try {
      const imagenes = [...(entry?.imagenes || [])];
      if (files.length && canUpload()) for (const f of files) imagenes.push(await uploadImage(f));
      const doc = { ...(entry || {}), date, valores, notas, imagenes, createdAt: entry?.createdAt || new Date().toISOString() };
      if (!isNut) { doc.tipo = tipo; doc.otros = otros; }
      await saveDoc(isNut ? 'nutrition' : 'measurements', entry?.id || newId(isNut ? 'n' : 'm'), doc);
      toast('Registro guardado');
      onClose();
    } catch (e) { setErr(e?.code === 'quota_or_state' ? 'No queda espacio para imágenes. Guarda sin captura.' : 'No se pudo guardar. Intenta de nuevo.'); } finally { setBusy(''); }
  }

  const groups = isNut ? [{ title: 'Del día', fields: NUTRITION_FIELDS }] : MEASURE_GROUPS;
  const filledKeys = new Set(Object.entries(vals).filter(([, v]) => v !== '').map(([k]) => k));
  const visibleGroups = groups.map((g) => ({ ...g, fields: g.fields.filter((f) => showAll || isNut || filledKeys.has(f.key) || ['peso', 'grasaPct', 'masaMuscular', 'cintura'].includes(f.key)) })).filter((g) => g.fields.length);

  return html`
    <${Sheet} title=${entry ? 'Editar registro' : isNut ? 'Nutrición' : 'Nueva medida'} onClose=${() => { ctl.current?.abort(); onClose(); }}>
      <div class="form-grid">
        <label class="field"><span>Fecha</span><input id="en-date" type="date" class="input" value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
        ${!isNut && html`<label class="field"><span>Fuente</span><select id="en-type" class="select" value=${tipo} onChange=${(e) => setTipo(e.target.value)}>${Object.entries(MEASURE_TYPES).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></label>`}
      </div>

      <div class="panel stack-sm">
        <span class="eyebrow">Capturas</span>
        <p class="small muted">${isNut ? 'Captura del resumen del día (o de la semana) en Fitia.' : 'Informe de antropometría, app de la báscula o Samsung Health.'}${imgCaps ? ' Claude leerá los valores.' : ' En esta vista Claude no puede leer imágenes; se guardan como respaldo.'}</p>
        <input id="en-files" type="file" accept="image/*" multiple onChange=${pick} />
        ${previews.length ? html`<div class="thumbs">${previews.map((u) => html`<img src=${u} alt="Captura seleccionada" />`)}</div>` : null}
        ${entry?.imagenes?.length ? html`<div class="thumbs">${entry.imagenes.map((id) => html`<img src=${assetUrl(id)} alt="Captura guardada" />`)}</div>` : null}
        ${files.length && imgCaps ? (busy === 'read'
          ? html`<div class="row"><${Thinking} text="Leyendo la captura…" /><button class="btn btn-sm" onClick=${() => ctl.current?.abort()}>Detener</button></div>`
          : html`<button class="btn btn-primary" onClick=${read}><${Icon} name="spark" /> Leer con Claude</button>`) : null}
        ${summary && html`<p class="small">${summary}</p>`}
      </div>

      ${visibleGroups.map((g) => html`
        <div class="stack-sm">
          <span class="eyebrow">${g.title}</span>
          <div class="form-grid">${g.fields.map((f) => html`
            <label class="field"><span>${f.label}${f.unit ? ` (${f.unit})` : ''}</span>
              <input id=${'v-' + f.key} class="input num" inputmode="decimal" value=${vals[f.key] ?? ''} onInput=${(e) => setVals({ ...vals, [f.key]: e.target.value })} /></label>`)}
          </div>
        </div>`)}
      ${!isNut && html`<button class="btn btn-ghost btn-sm" style="align-self:flex-start" onClick=${() => setShowAll(!showAll)}>${showAll ? 'Mostrar solo los llenos' : 'Mostrar todos los campos (perímetros, pliegues, somatotipo)'}</button>`}
      ${otros.length ? html`<div class="stack-sm"><span class="eyebrow">Otros datos de la captura</span><p class="small muted">${otros.map((o) => `${o.nombre}: ${o.valor}${o.unidad ? ' ' + o.unidad : ''}`).join(' · ')}</p></div>` : null}
      <label class="field"><span>Notas</span><textarea id="en-notes" class="textarea" style="min-height:64px" value=${notas} onInput=${(e) => setNotas(e.target.value)}></textarea></label>
      ${err && html`<p class="small" style="color:var(--bad)">${err}</p>`}
      <div class="row">
        <button class="btn btn-primary" disabled=${busy === 'save'} onClick=${save}>${busy === 'save' ? 'Guardando…' : 'Guardar'}</button>
        ${entry && html`<button class="btn btn-ghost btn-danger" onClick=${() => setConfirmDel(true)}><${Icon} name="trash" /> Eliminar</button>`}
      </div>
      ${confirmDel && html`<${Confirm} title="Eliminar registro" text=${`Se borra el registro del ${fmtDay(entry.date)}.`} onConfirm=${async () => { await deleteDoc(isNut ? 'nutrition' : 'measurements', entry.id); onClose(); }} onClose=${() => setConfirmDel(false)} />`}
    </${Sheet}>`;
}

function Measures({ list, open }) {
  const [metric, setMetric] = useState('peso');
  const [pick, setPick] = useState(null);
  const days = mergeMeasurementsByDate(list);
  const used = MEASURE_FIELDS.filter((f) => days.some((d) => d.valores[f.key] != null));
  const cols = days.slice(-8).reverse(); // la más reciente primero
  const pts = days.filter((d) => d.valores[metric] != null).map((d) => ({ x: fmtShort(d.date), y: Number(d.valores[metric]) }));
  const f = MEASURE_FIELDS.find((x) => x.key === metric);
  const openDay = (d) => (d.entries.length === 1 ? open({ entry: d.entries[0] }) : setPick(d));

  if (!list.length) return html`<div class="empty"><p>Sin medidas todavía. Sube una captura de tu antropometría, de la báscula o de Samsung Health.</p><button class="btn btn-primary" onClick=${() => open({})}><${Icon} name="camera" /> Subir captura</button></div>`;
  return html`
    <div class="stack">
      <div class="card stack-sm">
        <div class="row-between"><span class="eyebrow">${f?.label} · ${f?.unit}</span>
          <select id="metric" class="select" style="width:auto;min-height:34px" value=${metric} onChange=${(e) => setMetric(e.target.value)}>${used.map((u) => html`<option value=${u.key}>${u.label}</option>`)}</select></div>
        <${LineChart} series=${[{ name: f?.label, points: pts }]} />
      </div>
      <div class="mtable-wrap">
        <table class="mtable">
          <thead><tr><th>Medida</th>${cols.map((d) => html`<th><button class="btn btn-ghost btn-sm" onClick=${() => openDay(d)}>${fmtShort(d.date)}</button></th>`)}</tr>
            <tr><td class="xs muted">Fuentes</td>${cols.map((d) => html`<td class="xs muted">${d.tipos.map((t) => SOURCE_SHORT[t] || t).join(' · ')}</td>`)}</tr></thead>
          <tbody>${used.map((u) => html`<tr><td>${u.label} <span class="xs muted">${u.unit}</span></td>${cols.map((d) => html`<td>${d.valores[u.key] != null ? html`${fmtNum(Number(d.valores[u.key]), 2)}${d.tipos.length > 1 ? html`<sup class="src">${(SOURCE_SHORT[d.fuente[u.key]] || '?')[0]}</sup>` : null}` : '—'}</td>`)}</tr>`)}</tbody>
        </table>
      </div>
      <p class="xs muted">Los registros del mismo día se unen. Si un valor se repite, manda el reloj (R), luego la báscula (B) y la cinta (C). Toca una fecha para ver las capturas, corregir o eliminar.</p>
      ${pick && html`<${Sheet} title=${`Registros del ${fmtDay(pick.date)}`} onClose=${() => setPick(null)}>
        <div class="picker-list">${pick.entries.map((e) => html`<button class="pick" style="grid-template-columns:1fr auto" onClick=${() => { setPick(null); open({ entry: e }); }}>
          <div><b>${MEASURE_TYPES[e.tipo] || e.tipo}</b><div class="xs muted">${Object.keys(e.valores || {}).length} valores${e.notas ? ` · ${e.notas}` : ''}</div></div><${Icon} name="chevron" /></button>`)}</div>
      </${Sheet}>`}
    </div>`;
}

function Nutrition({ list, open }) {
  const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
  const since = dateKey(addDays(new Date(), -6));
  const last7 = sorted.filter((n) => n.date >= since);
  const avg = (k) => { const v = last7.map((n) => num(n.valores?.[k])).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const pts = (k) => sorted.slice(-30).filter((n) => n.valores?.[k] != null).map((n) => ({ x: fmtShort(n.date), y: Number(n.valores[k]) }));
  if (!list.length) return html`<div class="empty"><p>Sube la captura del resumen diario de Fitia y Claude registra calorías y macros.</p><button class="btn btn-primary" onClick=${() => open({})}><${Icon} name="camera" /> Subir captura de Fitia</button></div>`;
  return html`
    <div class="stack">
      <div class="kpis">
        ${[['kcal', 'Calorías', 'kcal'], ['proteina', 'Proteína', 'g'], ['carbohidratos', 'Carbos', 'g'], ['grasa', 'Grasa', 'g']].map(([k, l, u]) => html`
          <div class="kpi"><span class="eyebrow">${l} · prom. 7 d</span><span class="v">${avg(k) == null ? '—' : fmtNum(avg(k), 0)}<small>${u}</small></span><span class="delta flat">${last7.length} días registrados</span></div>`)}
      </div>
      <div class="anat-wrap">
        <div class="card stack-sm"><span class="eyebrow">Calorías</span><${LineChart} series=${[{ name: 'kcal', points: pts('kcal') }]} /></div>
        <div class="card stack-sm"><span class="eyebrow">Proteína · g</span><${LineChart} series=${[{ name: 'Proteína', points: pts('proteina') }]} /></div>
      </div>
      <div class="card mlist" style="padding:4px 12px">
        ${[...sorted].reverse().slice(0, 30).map((n) => html`
          <button class="mrow" style="grid-template-columns:6rem 1fr auto" onClick=${() => open({ entry: n })}>
            <span class="name">${fmtShort(n.date)}</span>
            <span class="small muted num">P ${fmtNum(n.valores?.proteina, 0)} · C ${fmtNum(n.valores?.carbohidratos, 0)} · G ${fmtNum(n.valores?.grasa, 0)}</span>
            <span class="val">${fmtNum(n.valores?.kcal, 0)}</span>
          </button>`)}
      </div>
    </div>`;
}

export function BodyView() {
  const st = useStore();
  const [tab, setTab] = useState('medidas');
  const [sheet, setSheet] = useState(null);
  const kind = tab === 'medidas' ? 'measurements' : 'nutrition';
  return html`
    <div class="stack">
      <header class="hello"><span class="eyebrow">Medidas y nutrición</span><h1>Cuerpo</h1></header>
      <div class="row-between">
        <div class="seg" role="group"><button aria-pressed=${tab === 'medidas'} onClick=${() => setTab('medidas')}>Medidas</button><button aria-pressed=${tab === 'nutricion'} onClick=${() => setTab('nutricion')}>Nutrición</button></div>
        <button class="btn btn-primary btn-sm" onClick=${() => setSheet({})}><${Icon} name="plus" size="16" /> ${tab === 'medidas' ? 'Nueva medida' : 'Registrar día'}</button>
      </div>
      ${tab === 'medidas' ? html`<${Measures} list=${st.measurements} open=${setSheet} />` : html`<${Nutrition} list=${st.nutrition} open=${setSheet} />`}
      <section class="panel stack-sm small">
        <span class="eyebrow">Cada cuánto</span>
        <p>Báscula o Samsung Watch: 1 vez por semana, mismo día y en ayunas. Antropometría ISAK: cada 4 a 8 semanas. Fitia: la captura del día al acostarte, o una semanal con el promedio.</p>
      </section>
      ${sheet && html`<${EntrySheet} kind=${sheet.kind || kind} entry=${sheet.entry} onClose=${() => setSheet(null)} />`}
    </div>`;
}
