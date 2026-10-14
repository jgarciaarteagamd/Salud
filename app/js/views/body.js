// Cuerpo: medidas (antropometría, bioimpedancia, Samsung Watch) y nutrición (Fitia).
// Cada registro se crea desde capturas que Claude lee, o a mano; siempre se revisa antes de guardar.
import { useStore, saveDoc, deleteDoc, newId, uploadImage, canUpload, assetUrl, blobsFromAssets } from '../store.js';
import {
  MEASURE_GROUPS, MEASURE_FIELDS, MEASURE_TYPES, NUTRITION_FIELDS, NUTRITION_GROUPS, WEEKLY_GROUPS, WEEKLY_FIELDS, isWeekly,
  NUTRITION_FIELD, FOOD_QUALITY, metaOf,
  mergeMeasurementsByDate, SOURCE_SHORT,
} from '../fields.js';
import { extractMeasurements, extractNutrition, imageLimits, errorCopy, microStats } from '../ai.js';
import { todayKey, fmtShort, fmtDay, fmtNum, num, addDays, dateKey, daysBetween } from '../stats.js';
import { Icon, Sheet, LineChart, Thinking, Confirm, toast, FilePick } from '../ui.js';
const { html, useState, useEffect, useMemo, useRef } = window.htmPreact;

function EntrySheet({ kind, entry, weekly, onClose }) {
  const isNut = kind === 'nutrition';
  const [periodo, setPeriodo] = useState(entry?.periodo || (weekly ? 'semana' : 'dia'));
  const isWeek = isNut && periodo === 'semana';
  const [date, setDate] = useState(entry?.date || (weekly ? dateKey(addDays(new Date(), -6)) : todayKey()));
  const [dateEnd, setDateEnd] = useState(entry?.dateEnd || (weekly ? todayKey() : ''));
  const [notes2, setNotes2] = useState({ fortalezas: entry?.fortalezas || [], mejoras: entry?.mejoras || [] });
  const [metas, setMetas] = useState(entry?.metas || {});
  const [calidad, setCalidad] = useState(entry?.calidad || '');
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
  const fields = isWeek ? WEEKLY_FIELDS : isNut ? NUTRITION_FIELDS : MEASURE_FIELDS;

  useEffect(() => { imageLimits().then(setImgCaps); }, []);
  // Captura guardada sin leer: se lee sola al abrirla en una vista que puede leer imágenes.
  useEffect(() => { if (imgCaps && entry?.pendiente && entry?.imagenes?.length) read(); }, [imgCaps]);
  useEffect(() => { const urls = files.map((f) => URL.createObjectURL(f)); setPreviews(urls); return () => urls.forEach((u) => URL.revokeObjectURL(u)); }, [files]);


  // Las capturas recién elegidas o, si no hay, las ya guardadas en el registro.
  const pickImgs = () => (files.length ? files : blobsFromAssets(entry?.imagenes || []));
  async function read(override) {
    setBusy('read'); setErr(''); ctl.current = new AbortController();
    try {
      const r = isNut ? await extractNutrition((override || await pickImgs()), { signal: ctl.current.signal, weekly: isWeek })
        : await extractMeasurements((override || await pickImgs()), MEASURE_TYPES[tipo], { signal: ctl.current.signal });
      const week = isNut && r?.periodo === 'semana';
      if (isNut) setPeriodo(week ? 'semana' : 'dia');
      if (week && r?.fechaFin && /^\d{4}-\d{2}-\d{2}$/.test(r.fechaFin)) setDateEnd(r.fechaFin);
      if (isNut) setNotes2({ fortalezas: (r?.fortalezas || []).filter(Boolean), mejoras: (r?.mejoras || []).filter(Boolean) });
      const allowed = week ? WEEKLY_FIELDS : isNut ? NUTRITION_FIELDS : MEASURE_FIELDS;
      const next = { ...vals };
      for (const [k, v] of Object.entries(r?.valores || {})) if (allowed.some((f) => f.key === k) && num(v) != null) next[k] = String(num(v));
      setVals(next);
      if (r?.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) setDate(r.fecha);
      if (!isNut && r?.tipo && MEASURE_TYPES[r.tipo]) setTipo(r.tipo);
      if (Array.isArray(r?.otros)) setOtros(r.otros.filter((o) => o?.nombre));
      if (isNut && r?.metas && typeof r.metas === 'object') {
        const m = { ...metas };
        for (const [k, v] of Object.entries(r.metas)) if (NUTRITION_FIELD[k] && num(v) != null) m[k] = num(v);
        setMetas(m);
      }
      if (isNut && FOOD_QUALITY.includes(r?.calidad)) setCalidad(r.calidad);
      setSummary(r?.resumen || '');
      toast('Valores leídos: revísalos antes de guardar');
    } catch (e) { setErr(e?.code === 'asset_fetch' ? 'No se pudo abrir la captura guardada. Vuelve a elegirla.' : errorCopy(e)); } finally { setBusy(''); }
  }

  async function save() {
    const valores = {};
    for (const f of fields) { const n = num(vals[f.key]); if (n != null) valores[f.key] = n; }
    const hasValues = Object.keys(valores).length > 0;
    // Si hay captura y Claude puede leerla, primero se lee y se revisa; luego se guarda.
    if (!hasValues && imgCaps && (files.length || entry?.imagenes?.length)) { await read(); return; }
    // Sin valores se puede guardar solo la captura, para leerla después con Claude.
    if (!hasValues && !files.length && !entry?.imagenes?.length) { setErr('Elige una captura o escribe al menos un valor.'); return; }
    if (!hasValues && files.length && !canUpload()) { setErr('En esta vista no se pueden guardar imágenes. Escribe los valores o abre la app desde el navegador.'); return; }
    setBusy('save');
    try {
      const imagenes = [...(entry?.imagenes || [])];
      if (files.length && canUpload()) for (const f of files) imagenes.push(await uploadImage(f));
      const doc = { ...(entry || {}), date, valores, notas, imagenes, createdAt: entry?.createdAt || new Date().toISOString(), pendiente: !hasValues };
      if (!isNut) { doc.tipo = tipo; doc.otros = otros; }
      if (isNut) {
        doc.periodo = periodo; doc.fuente = entry?.fuente || 'fitia';
        doc.metas = metas; doc.calidad = calidad || null;
        if (isWeek) { doc.dateEnd = dateEnd || null; doc.fortalezas = notes2.fortalezas; doc.mejoras = notes2.mejoras; }
      }
      await saveDoc(isNut ? 'nutrition' : 'measurements', entry?.id || newId(isNut ? 'n' : 'm'), doc);
      toast(hasValues ? 'Registro guardado' : 'Captura guardada: léela con Claude cuando puedas');
      onClose();
    } catch (e) { setErr(e?.code === 'quota_or_state' ? 'No queda espacio para imágenes. Guarda sin captura.' : 'No se pudo guardar. Intenta de nuevo.'); } finally { setBusy(''); }
  }

  const groups = isWeek ? WEEKLY_GROUPS : isNut ? NUTRITION_GROUPS : MEASURE_GROUPS;
  const filledKeys = new Set(Object.entries(vals).filter(([, v]) => v !== '').map(([k]) => k));
  const always = isNut ? new Set([...NUTRITION_GROUPS[0].fields, ...NUTRITION_GROUPS[1].fields, ...WEEKLY_FIELDS].map((f) => f.key)) : new Set(['peso', 'grasaPct', 'masaMuscular', 'cintura']);
  const visibleGroups = groups.map((g) => ({ ...g, fields: g.fields.filter((f) => showAll || filledKeys.has(f.key) || always.has(f.key)) })).filter((g) => g.fields.length);

  return html`
    <${Sheet} title=${entry ? 'Editar registro' : isWeek ? 'Score nutricional semanal' : isNut ? 'Nutrición del día' : 'Nueva medida'} onClose=${() => { ctl.current?.abort(); onClose(); }}>
      ${isNut && !entry && html`<div class="seg" role="group" aria-label="Tipo de captura"><button aria-pressed=${!isWeek} onClick=${() => setPeriodo('dia')}>Resumen del día</button><button aria-pressed=${isWeek} onClick=${() => { setPeriodo('semana'); if (!dateEnd) { setDateEnd(date); setDate(dateKey(addDays(new Date(date + 'T12:00'), -6))); } }}>Score semanal</button></div>`}
      <div class="form-grid">
        <label class="field"><span>${isWeek ? 'Desde' : 'Fecha'}</span><input id="en-date" type="date" class="input" value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
        ${isWeek && html`<label class="field"><span>Hasta</span><input id="en-date-end" type="date" class="input" value=${dateEnd} onInput=${(e) => setDateEnd(e.target.value)} /></label>`}
        ${!isNut && html`<label class="field"><span>Fuente</span><select id="en-type" class="select" value=${tipo} onChange=${(e) => setTipo(e.target.value)}>${Object.entries(MEASURE_TYPES).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></label>`}
      </div>

      <div class="panel stack-sm">
        <span class="eyebrow">Capturas</span>
        <p class="small muted">${isWeek ? 'Captura del “Score nutricional” de la semana en Fitia (puedes subir varias pantallas).' : isNut ? 'Captura del resumen del día en Fitia.' : 'Informe de antropometría, app de la báscula o Samsung Health.'}${imgCaps ? ' Claude leerá los valores.' : ' En esta vista Claude no puede leer imágenes; se guardan como respaldo.'}</p>
        <${FilePick} id="en-files" count=${files.length} onPick=${(fl) => { const sel = fl.slice(0, imgCaps?.maxCount || 6); setFiles(sel); setErr(''); if (imgCaps && sel.length) read(sel); }} />
        ${previews.length ? html`<div class="thumbs">${previews.map((u) => html`<img src=${u} alt="Captura seleccionada" />`)}</div>` : null}
        ${entry?.imagenes?.length ? html`<div class="thumbs">${entry.imagenes.map((id) => html`<img src=${assetUrl(id)} alt="Captura guardada" />`)}</div>` : null}
        ${(files.length || entry?.imagenes?.length) && imgCaps ? (busy === 'read'
          ? html`<div class="row"><${Thinking} text="Leyendo la captura…" /><button class="btn btn-sm" onClick=${() => ctl.current?.abort()}>Detener</button></div>`
          : html`<button class="btn btn-primary" onClick=${read}><${Icon} name="spark" /> Leer con Claude</button>`) : null}
        ${summary && html`<p class="small">${summary}</p>`}
      </div>

      ${visibleGroups.map((g) => html`
        <div class="stack-sm">
          <span class="eyebrow">${g.title}</span>
          <div class="form-grid">${g.fields.map((f) => { const m = isNut && f.meta ? (num(metas[f.key]) || f.meta) : null; return html`
            <label class="field"><span>${f.label}${f.unit ? ` (${f.unit}${m ? `${g.limit ? ' · máx ' : ' · meta '}${fmtNum(m, 2)}` : ''})` : ''}</span>
              <input id=${'v-' + f.key} class="input num" inputmode="decimal" value=${vals[f.key] ?? ''} onInput=${(e) => setVals({ ...vals, [f.key]: e.target.value })} /></label>`; })}
          </div>
        </div>`)}
      ${isNut && html`<label class="field"><span>Calidad de alimentos (Fitia)</span><select id="en-quality" class="select" value=${calidad} onChange=${(e) => setCalidad(e.target.value)}><option value="">Sin dato</option>${FOOD_QUALITY.map((q) => html`<option value=${q}>${q}</option>`)}</select></label>`}
      ${!isWeek && html`<button class="btn btn-ghost btn-sm" style="align-self:flex-start" onClick=${() => setShowAll(!showAll)}>${showAll ? 'Mostrar solo los llenos' : isNut ? 'Mostrar vitaminas, minerales y nutrientes a limitar' : 'Mostrar todos los campos (perímetros, pliegues, somatotipo)'}</button>`}
      ${isWeek && (notes2.fortalezas.length || notes2.mejoras.length) ? html`<div class="stack-sm">
        ${notes2.fortalezas.length ? html`<span class="eyebrow">Lo que hiciste bien</span><ul class="small" style="margin:0;padding-left:18px">${notes2.fortalezas.map((t) => html`<li>${t}</li>`)}</ul>` : null}
        ${notes2.mejoras.length ? html`<span class="eyebrow">Por mejorar</span><ul class="small" style="margin:0;padding-left:18px">${notes2.mejoras.map((t) => html`<li>${t}</li>`)}</ul>` : null}
      </div>` : null}
      ${otros.length ? html`<div class="stack-sm"><span class="eyebrow">Otros datos de la captura</span><p class="small muted">${otros.map((o) => `${o.nombre}: ${o.valor}${o.unidad ? ' ' + o.unidad : ''}`).join(' · ')}</p></div>` : null}
      <label class="field"><span>Notas</span><textarea id="en-notes" class="textarea" style="min-height:64px" value=${notas} onInput=${(e) => setNotas(e.target.value)}></textarea></label>
      ${err && html`<p class="small" style="color:var(--bad)">${err}</p>`}
      <div class="row">
        <button class="btn btn-primary" disabled=${busy === 'save'} onClick=${save}>${busy === 'save' ? 'Guardando…' : 'Guardar'}</button>
        ${entry && html`<button class="btn btn-ghost btn-danger" onClick=${() => setConfirmDel(true)}><${Icon} name="trash" /> Eliminar</button>`}
      </div>
      ${confirmDel && html`<${Confirm} title="Eliminar registro" text=${isWeek ? `Se borra el score semanal del ${fmtDay(entry.date)}.` : `Se borra el registro del ${fmtDay(entry.date)}.`} onConfirm=${async () => { await deleteDoc(isNut ? 'nutrition' : 'measurements', entry.id); onClose(); }} onClose=${() => setConfirmDel(false)} />`}
    </${Sheet}>`;
}

// Capturas guardadas sin leer (p. ej. desde una vista donde Claude no podía leer imágenes).
function Pending({ list, open }) {
  const pend = list.filter((e) => e.pendiente).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!pend.length) return null;
  return html`<div class="panel stack-sm">
    <span class="eyebrow">${pend.length === 1 ? '1 captura sin leer' : `${pend.length} capturas sin leer`}</span>
    <p class="small muted">Ábrela desde una vista donde Claude pueda leer imágenes (el navegador) y toca “Leer con Claude”.</p>
    <div class="row">${pend.map((e) => html`<button class="btn btn-sm" onClick=${() => open({ entry: e })}><${Icon} name="image" size="16" /> ${fmtShort(e.date)}</button>`)}</div>
  </div>`;
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
      <${Pending} list=${list} open=${open} />
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

const OBJ_KEY = { kcal: 'kcalObjetivo', proteina: 'proteinaObjetivo', carbohidratos: 'carbObjetivo', grasa: 'grasaObjetivo' };
const levelOf = (x) => (x.limit ? (x.pct > 1.2 ? 'bad' : x.pct > 1 ? 'warn' : 'good') : (x.pct < 0.5 ? 'bad' : x.pct < 0.9 ? 'warn' : 'good'));

// Vitaminas, minerales, fibra y nutrientes a limitar: promedio del periodo frente a la meta de Fitia.
function MicroPanel({ days }) {
  const [range, setRange] = useState(30);
  const [metric, setMetric] = useState(null);
  const [all, setAll] = useState(false);
  const since = range ? dateKey(addDays(new Date(), -(range - 1))) : '';
  const rows = days.filter((n) => n.date >= since);
  const { micro, limit } = useMemo(() => microStats(rows), [days, range]);
  if (!micro.length && !limit.length) return null;
  const low = [...micro].sort((a, b) => a.pct - b.pct);
  const worst = low.filter((x) => x.pct < 0.7).slice(0, 4);
  const pickKey = metric || low[0]?.key;
  const f = NUTRITION_FIELD[pickKey];
  const chartRows = days.slice(-30);
  const series = [{ name: f?.label, points: chartRows.map((n) => ({ x: fmtShort(n.date), y: num(n.valores?.[pickKey]) })) }];
  const metaPts = chartRows.map((n) => ({ x: fmtShort(n.date), y: OBJ_KEY[pickKey] ? num(n.valores?.[OBJ_KEY[pickKey]]) : metaOf(n, pickKey) }));
  if (metaPts.some((p) => p.y != null)) series.push({ name: 'Meta', points: metaPts });
  const bar = (x) => html`
    <button class=${'nbar ' + levelOf(x) + (x.key === pickKey ? ' sel' : '')} onClick=${() => setMetric(x.key)} aria-label=${`${x.label}: ver evolución`}>
      <span class="nb-name">${x.label}</span>
      <span class="nb-val num">${fmtNum(x.avg, x.avg < 10 ? 1 : 0)}<small> / ${fmtNum(x.meta, x.meta < 10 ? 1 : 0)} ${x.unit}</small></span>
      <span class="nb-track"><i style=${`width:${Math.min(100, (x.pct / 1.5) * 100)}%`}></i><b style="left:66.7%"></b></span>
      <span class="nb-pct num">${fmtNum(x.pct * 100, 0)} %</span>
    </button>`;
  return html`
    <section class="section stack-sm">
      <div class="row-between"><span class="eyebrow">Vitaminas, minerales y fibra</span>
        <div class="seg" role="group" aria-label="Periodo">${[[7, '7 días'], [30, '30 días'], [0, 'Todo']].map(([v, l]) => html`<button aria-pressed=${range === v} onClick=${() => setRange(v)}>${l}</button>`)}</div></div>
      <p class="small muted">Promedio de ${rows.length} ${rows.length === 1 ? 'día registrado' : 'días registrados'} frente a la meta diaria de Fitia. La línea marca el 100 %.${worst.length ? html` Más bajos: <b>${worst.map((x) => x.label.replace(/ \(.*\)/, '')).join(', ')}</b>.` : ''}</p>
      <div class="card nbars">${low.filter((x) => all || x.pct < 0.9).map(bar)}
        ${low.some((x) => x.pct >= 0.9) && html`<button class="btn btn-ghost btn-sm" style="justify-self:start" onClick=${() => setAll(!all)}>${all ? 'Ocultar los cubiertos' : `Ver los ${low.filter((x) => x.pct >= 0.9).length} que ya cubres (≥ 90 %)`}</button>`}</div>
      ${limit.length ? html`<span class="eyebrow">A limitar · promedio frente al máximo</span><div class="card nbars">${limit.map(bar)}</div>` : null}
      <div class="card stack-sm"><span class="eyebrow">${f?.label} · ${f?.unit} · últimos registros</span><${LineChart} series=${series} />
        <p class="xs muted">Toca cualquier nutriente para ver su evolución.</p></div>
    </section>`;
}

function Nutrition({ list, open }) {
  const days = list.filter((n) => !isWeekly(n));
  const weeks = list.filter(isWeekly).sort((a, b) => (a.date < b.date ? 1 : -1));
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const since = dateKey(addDays(new Date(), -6));
  const last7 = sorted.filter((n) => n.date >= since);
  const base = last7.length ? last7 : sorted.slice(-7);
  const avg = (k) => { const v = base.map((n) => num(n.valores?.[k])).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const pts = (k) => sorted.slice(-30).map((n) => ({ x: fmtShort(n.date), y: n.valores?.[k] != null ? Number(n.valores[k]) : null }));
  const has = (k) => sorted.some((n) => n.valores?.[k] != null);
  if (!list.length) return html`<div class="empty"><p>Sube la captura del resumen diario de Fitia y Claude registra calorías y macros.</p><button class="btn btn-primary" onClick=${() => open({})}><${Icon} name="camera" /> Subir captura de Fitia</button></div>`;
  return html`
    <div class="stack">
      <${Pending} list=${list} open=${open} />
      <div class="kpis">
        ${[['kcal', 'Calorías', 'kcal', 'kcalObjetivo'], ['proteina', 'Proteína', 'g', 'proteinaObjetivo'], ['carbohidratos', 'Carbos', 'g', 'carbObjetivo'], ['grasa', 'Grasa', 'g', 'grasaObjetivo']].map(([k, l, u, meta]) => html`
          <div class="kpi"><span class="eyebrow">${l} · prom. ${last7.length ? '7 d' : 'últimos 7 reg.'}</span><span class="v">${avg(k) == null ? '—' : fmtNum(avg(k), 0)}<small>${u}</small></span><span class="delta flat">${avg(meta) != null ? `meta ${fmtNum(avg(meta), 0)} ${u} · ` : ''}${last7.length ? `${last7.length} de 7 días` : `último: ${fmtShort(sorted[sorted.length - 1]?.date || todayKey())}`}</span></div>`)}
      </div>
      <div class="anat-wrap">
        <div class="card stack-sm"><span class="eyebrow">Calorías · consumidas y meta</span><${LineChart} series=${[{ name: 'kcal', points: pts('kcal') }, ...(has('kcalObjetivo') ? [{ name: 'Meta', points: pts('kcalObjetivo') }] : [])]} /></div>
        <div class="card stack-sm"><span class="eyebrow">Proteína · g, con meta</span><${LineChart} series=${[{ name: 'Proteína', points: pts('proteina') }, ...(has('proteinaObjetivo') ? [{ name: 'Meta', points: pts('proteinaObjetivo') }] : [])]} /></div>
      </div>
      <${MicroPanel} days=${sorted} />

      <section class="section">
        <div class="row-between"><span class="eyebrow">Score nutricional semanal</span>
          <button class="btn btn-sm" onClick=${() => open({ weekly: true })}><${Icon} name="camera" size="16" /> Subir score semanal</button></div>
        ${weeks.length ? html`<div class="card mlist" style="padding:4px 12px">${weeks.map((w) => html`
          <button class="mrow" style="grid-template-columns:1fr auto" onClick=${() => open({ entry: w })}>
            <span><span class="name">${fmtShort(w.date)}${w.dateEnd ? ` – ${fmtShort(w.dateEnd)}` : ''}</span><br /><span class="xs muted num">${fmtNum(w.valores?.kcal, 0)} kcal · P ${fmtNum(w.valores?.proteina, 0)} g promedio${w.mejoras?.length ? ` · mejorar: ${w.mejoras[0]}` : ''}</span></span>
            <span class="val">${w.valores?.score != null ? `${fmtNum(w.valores.score, 1)}${w.valores.scoreMax ? `/${fmtNum(w.valores.scoreMax, 0)}` : ''}` : '—'}</span>
          </button>`)}</div>` : html`<p class="small muted">Al cerrar la semana, sube la captura del Score nutricional de Fitia. Claude guarda el puntaje, los promedios y lo que la app te sugiere mejorar.</p>`}
      </section>

      <section class="section">
        <span class="eyebrow">Días registrados</span>
        <div class="card mlist" style="padding:4px 12px">
          ${[...sorted].reverse().slice(0, 45).map((n, i, arr) => {
            const gap = i > 0 ? daysBetween(n.date, arr[i - 1].date) - 1 : 0;
            const k = num(n.valores?.kcal); const o = num(n.valores?.kcalObjetivo);
            return html`
              ${gap > 0 ? html`<div class="xs muted" style="padding:6px 0">${gap === 1 ? '1 día' : `${gap} días`} sin registro</div>` : null}
              <button class="mrow" style="grid-template-columns:4.2rem 1fr auto" onClick=${() => open({ entry: n })}>
                <span class="name">${fmtShort(n.date)}</span>
                <span class="small muted num">P ${fmtNum(n.valores?.proteina, 0)} · C ${fmtNum(n.valores?.carbohidratos, 0)} · G ${fmtNum(n.valores?.grasa, 0)}${n.calidad ? html`<br /><span class="xs">Calidad ${n.calidad.toLowerCase()}</span>` : null}</span>
                <span class="val" style=${k != null && o ? `color:${k > o * 1.1 ? 'var(--warn)' : 'inherit'}` : ''}>${fmtNum(k, 0)}${o ? html`<small class="muted">/${fmtNum(o, 0)}</small>` : null}</span>
              </button>`;
          })}
        </div>
        <p class="xs muted">Calorías consumidas / meta de Fitia. En ámbar, los días más de 10 % sobre la meta.</p>
      </section>
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
        <p>Báscula o Samsung Watch: 1 vez por semana, mismo día y en ayunas. Antropometría ISAK: cada 4 a 8 semanas. Fitia: la captura del día al acostarte y, al cerrar la semana, la del Score nutricional.</p>
      </section>
      ${sheet && html`<${EntrySheet} kind=${sheet.kind || kind} entry=${sheet.entry} weekly=${sheet.weekly} onClose=${() => setSheet(null)} />`}
    </div>`;
}
