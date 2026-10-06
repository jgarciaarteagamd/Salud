// Más: catálogo de ejercicios (crear, editar, eliminar), perfil para Claude y sincronización con Mi Salud.
import { useStore, saveDoc, deleteDoc, newId, uploadImage, canUpload, getState, saveProfile } from '../store.js';
import { MUSCLES, muscleShort, SAFETY } from '../muscles.js';
import { miSaludSummary } from '../ai.js';
import { completedSessions, exerciseHistory, fmtShort, fmtNum, todayKey } from '../stats.js';
import { Icon, Sheet, ExImage, LineChart, Confirm, toast, copyText } from '../ui.js';
const { html, useState, useMemo } = window.htmPreact;

const EN = {
  pecho: 'chest', deltoide_ant: 'front shoulders', deltoide_lat: 'side shoulders', deltoide_post: 'rear shoulders', triceps: 'triceps', biceps: 'biceps',
  antebrazo: 'forearms', dorsales: 'lats', espalda_media: 'mid back', trapecio: 'trapezius', lumbar: 'lower back', abdomen: 'abs', oblicuos: 'obliques',
  gluteos: 'glutes', abductores: 'outer hips', aductores: 'inner thighs', cuadriceps: 'quadriceps', isquios: 'hamstrings', pantorrillas: 'calves',
};
// Misma plantilla con la que se generó el catálogo base en Higgsfield (modelo GPT Image, 1:1).
export function higgsfieldPrompt(ex) {
  const hi = [...(ex.primary || []), ...(ex.secondary || [])].map((m) => EN[m] || m).join(', ') || 'target muscles';
  return `Flat minimalist instructional fitness illustration, part of a consistent exercise icon series. One athletic adult figure drawn as a smooth, faceless, uniform slate-gray (#3A4550) mannequin with clean geometric shapes and no clothing details, performing: ${ex.prompt || `${ex.name}${ex.equipment ? ` using ${ex.equipment}` : ''}`}. The working muscles (${hi}) are highlighted in solid coral red (#E5533D). Equipment drawn in light cool-gray (#B8C2CC) with thin dark outlines. Three-quarter side view, full body and equipment visible, centered with generous margin. Plain flat background color #EEF2F4, a soft subtle floor ellipse shadow. No text, no letters, no labels, no logos, no arrows, no gradients, no realistic texture.`;
}

function MuscleToggle({ primary, secondary, onChange }) {
  const state = (id) => (primary.includes(id) ? 'p' : secondary.includes(id) ? 's' : '');
  const cycle = (id) => {
    const s = state(id);
    const p = primary.filter((x) => x !== id); const q = secondary.filter((x) => x !== id);
    if (s === '') p.push(id); else if (s === 'p') q.push(id);
    onChange(p, q);
  };
  return html`<div class="chips">${MUSCLES.map((m) => {
    const s = state(m.id);
    return html`<button class=${'chip' + (s === 'p' ? ' primary' : s === 's' ? ' warn' : '')} aria-pressed=${false} onClick=${() => cycle(m.id)}>${s === 'p' ? '● ' : s === 's' ? '○ ' : ''}${muscleShort(m.id)}</button>`;
  })}</div>`;
}

function ExerciseSheet({ ex, onClose }) {
  const st = getState();
  const [e, setE] = useState(() => ({ name: '', primary: [], secondary: [], equipment: '', knee: 'ok', back: 'ok', cues: '', ...(ex || {}) }));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const up = (k) => (v) => setE({ ...e, [k]: v });
  const done = useMemo(() => completedSessions(st.sessions), [st.sessions]);
  const hist = ex?.id ? exerciseHistory(done, ex.id).filter((r) => r.best) : [];

  async function save() {
    if (!e.name.trim() || !e.primary.length) { toast('Ponle nombre y al menos un músculo principal'); return; }
    const id = ex?.id || newId('ex');
    await saveDoc('exercises', id, { ...e, name: e.name.trim(), createdAt: e.createdAt || new Date().toISOString() });
    toast('Ejercicio guardado'); onClose();
  }
  async function onImage(ev) {
    const f = ev.target.files?.[0]; if (!f) return;
    setBusy(true);
    try { const id = await uploadImage(f); setE({ ...e, imageAsset: id }); toast('Dibujo cargado: guarda para aplicarlo'); } catch { toast('No se pudo subir la imagen'); } finally { setBusy(false); }
  }

  return html`
    <${Sheet} title=${ex ? 'Editar ejercicio' : 'Nuevo ejercicio'} onClose=${onClose}>
      <div style="display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:center">
        <div class="ex-thumb" style="width:96px;height:96px"><${ExImage} ex=${e} /></div>
        <div class="stack-sm">
          ${canUpload() && html`<label class="btn btn-sm" style="cursor:pointer"><${Icon} name="image" size="16" /> ${busy ? 'Subiendo…' : 'Subir dibujo'}<input type="file" accept="image/*" class="sr" onChange=${onImage} /></label>`}
          ${e.imageAsset && html`<button class="btn btn-sm btn-ghost" onClick=${() => setE({ ...e, imageAsset: null })}>Usar dibujo original</button>`}
          <button class="btn btn-sm btn-ghost" onClick=${() => setShowPrompt(!showPrompt)}>Prompt para Higgsfield</button>
        </div>
      </div>
      ${showPrompt && html`<div class="stack-sm"><p class="xs muted">Genera en Higgsfield con GPT Image, formato 1:1, y súbelo aquí para mantener el mismo estilo.</p><div class="copybox">${higgsfieldPrompt(e)}</div><button class="btn btn-sm" onClick=${() => copyText(higgsfieldPrompt(e))}><${Icon} name="copy" size="16" /> Copiar prompt</button></div>`}
      <label class="field"><span>Nombre</span><input id="ex-name" class="input" value=${e.name} onInput=${(x) => up('name')(x.target.value)} /></label>
      <div class="field"><span>Músculos · toca una vez = principal ●, dos = secundario ○</span>
        <${MuscleToggle} primary=${e.primary} secondary=${e.secondary} onChange=${(p, s) => setE({ ...e, primary: p, secondary: s })} /></div>
      <label class="field"><span>Equipo</span><input id="ex-eq" class="input" value=${e.equipment} onInput=${(x) => up('equipment')(x.target.value)} placeholder="Máquina, mancuernas, polea…" /></label>
      <div class="form-grid">
        <label class="field"><span>Rodilla derecha</span><select id="ex-knee" class="select" value=${e.knee} onChange=${(x) => up('knee')(x.target.value)}>${Object.entries(SAFETY).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select></label>
        <label class="field"><span>Espalda</span><select id="ex-back" class="select" value=${e.back} onChange=${(x) => up('back')(x.target.value)}>${Object.entries(SAFETY).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select></label>
      </div>
      <label class="field"><span>Técnica y claves</span><textarea id="ex-cues" class="textarea" style="min-height:64px" value=${e.cues} onInput=${(x) => up('cues')(x.target.value)}></textarea></label>
      ${hist.length ? html`<div class="card stack-sm"><span class="eyebrow">1RM estimado · ${hist.length} sesiones</span><${LineChart} series=${[{ name: '1RM', points: hist.slice(-12).map((r) => ({ x: fmtShort(r.date), y: Math.round(r.best.e1rm * 10) / 10 })) }]} unit=" kg" /></div>` : null}
      <div class="row">
        <button class="btn btn-primary" onClick=${save}>Guardar</button>
        ${ex && html`<button class="btn btn-ghost btn-danger" onClick=${() => setConfirm(true)}><${Icon} name="trash" /> Eliminar</button>`}
      </div>
      ${confirm && html`<${Confirm} title="Eliminar ejercicio" text="Se quita del catálogo. Las sesiones pasadas conservan su nombre y sus series." onConfirm=${async () => { await deleteDoc('exercises', ex.id); toast('Ejercicio eliminado'); onClose(); }} onClose=${() => setConfirm(false)} />`}
    </${Sheet}>`;
}

function Catalog() {
  const st = useStore();
  const [q, setQ] = useState(''); const [m, setM] = useState(''); const [sheet, setSheet] = useState(null);
  const list = st.exercises.filter((e) => !e.archived)
    .filter((e) => !m || (e.primary || []).includes(m))
    .filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return html`
    <div class="stack">
      <div class="row"><input id="cat-q" class="input grow" style="flex:1 1 200px" type="search" placeholder="Buscar" value=${q} onInput=${(e) => setQ(e.target.value)} />
        <button class="btn btn-primary" onClick=${() => setSheet({})}><${Icon} name="plus" /> Nuevo</button></div>
      <div class="chips"><button class="chip" aria-pressed=${!m} onClick=${() => setM('')}>Todos</button>${MUSCLES.map((mm) => html`<button class="chip" aria-pressed=${m === mm.id} onClick=${() => setM(m === mm.id ? '' : mm.id)}>${muscleShort(mm.id)}</button>`)}</div>
      ${!st.exercises.length && html`<div class="empty"><p>El catálogo está vacío. Crea tu primer ejercicio o pídele a Claude una sesión: los ejercicios que proponga se agregan solos.</p></div>`}
      <div class="ex-grid">
        ${list.map((e) => html`
          <button class="ex-tile" onClick=${() => setSheet({ ex: e })}>
            <div class="img"><${ExImage} ex=${e} /></div>
            <div class="meta"><b>${e.name}</b>
              <div class="chips">${(e.primary || []).slice(0, 2).map((x) => html`<span class="chip primary">${muscleShort(x)}</span>`)}
                ${e.knee && e.knee !== 'ok' ? html`<span class=${'chip ' + SAFETY[e.knee].cls}>Rodilla</span>` : null}
                ${e.back && e.back !== 'ok' ? html`<span class=${'chip ' + SAFETY[e.back].cls}>Espalda</span>` : null}</div></div>
          </button>`)}
      </div>
      ${sheet && html`<${ExerciseSheet} ex=${sheet.ex} onClose=${() => setSheet(null)} />`}
    </div>`;
}

function ProfileLoader() {
  const st = useStore();
  if (!st.loaded.profile) return html`<p class="muted">Cargando perfil…</p>`;
  return html`<${Profile} key=${st.profile?.updatedAt || 'nuevo'} />`;
}

function Profile() {
  const st = getState();
  const [p, setP] = useState(() => ({ gimnasio: 'Forus', ...(st.profile || {}) }));
  const up = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const F = (k, label, attrs = {}) => html`<label class="field"><span>${label}</span><input id=${'pf-' + k} class="input" value=${p[k] ?? ''} onInput=${up(k)} ...${attrs} /></label>`;
  return html`
    <div class="stack">
      <p class="small muted">Claude usa este perfil cada vez que arma una sesión. Mientras más preciso, mejor.</p>
      <div class="form-grid">
        ${F('nombre', 'Nombre')}${F('edad', 'Edad', { inputmode: 'numeric' })}${F('sexo', 'Sexo')}${F('estatura', 'Estatura (cm)', { inputmode: 'numeric' })}
        ${F('diasSemana', 'Días por semana', { inputmode: 'numeric' })}${F('duracionMin', 'Duración habitual (min)', { inputmode: 'numeric' })}
      </div>
      ${F('gimnasio', 'Gimnasio')}
      ${F('equipamiento', 'Equipamiento o sede', { placeholder: 'Sede, máquinas que suelen estar ocupadas…' })}
      <label class="field"><span>Objetivo</span><input id="pf-objetivo" class="input" value=${p.objetivo ?? ''} onInput=${up('objetivo')} placeholder="Ganar masa muscular manteniendo grasa, recomposición…" /></label>
      <label class="field"><span>Antecedentes de rodilla derecha y espalda</span>
        <textarea id="pf-ant" class="textarea" value=${p.antecedentes ?? ''} onInput=${up('antecedentes')} placeholder="Diagnóstico, desde cuándo, qué movimientos duelen, qué indicó el médico o fisioterapeuta"></textarea></label>
      <label class="field"><span>Preferencias</span><input id="pf-pref" class="input" value=${p.preferencias ?? ''} onInput=${up('preferencias')} placeholder="Ejercicios que te gustan o evitas" /></label>
      <div class="panel stack-sm">
        <span class="eyebrow">Contexto de Mi Salud</span>
        <p class="small">Esta app no puede leer la memoria de tu proyecto Mi Salud. Pídele allí: <i>“Resúmeme en un texto mis antecedentes, mis avances de entrenamiento, mis antropometrías y lo que debo cuidar, para pegarlo en Forus Log”</i>, y pega la respuesta aquí.</p>
        <textarea id="pf-ctx" class="textarea" style="min-height:140px" value=${p.contextoMiSalud ?? ''} onInput=${up('contextoMiSalud')}></textarea>
      </div>
      <button class="btn btn-primary" onClick=${async () => { await saveProfile(p); toast('Perfil guardado'); }}>Guardar perfil</button>
    </div>`;
}

function Export() {
  const st = useStore();
  const [days, setDays] = useState(14);
  const text = useMemo(() => miSaludSummary({ ...st, days }), [st.sessions, st.measurements, st.nutrition, st.profile, days]);
  async function backup() {
    const data = JSON.stringify({ exportado: new Date().toISOString(), profile: st.profile, exercises: st.exercises, sessions: st.sessions, measurements: st.measurements, nutrition: st.nutrition }, null, 2);
    try {
      const dl = await window.claude?.use?.('downloads');
      if (!dl) { toast('Descarga no disponible en esta vista'); return; }
      await dl.save({ filename: `forus-log-${todayKey()}.json`, data });
    } catch (e) { if (e?.code !== 'declined') toast('No se pudo descargar'); }
  }
  return html`
    <div class="stack">
      <div class="panel stack-sm">
        <span class="eyebrow">Llevar tus avances a Mi Salud</span>
        <p class="small">Copia este resumen y pégalo en tu proyecto Mi Salud para que su memoria quede al día con tus sesiones, cambios y medidas.</p>
        <div class="seg" role="group">${[7, 14, 30].map((d) => html`<button aria-pressed=${days === d} onClick=${() => setDays(d)}>${d} días</button>`)}</div>
        <div class="copybox">${text}</div>
        <button class="btn btn-primary" onClick=${() => copyText(text)}><${Icon} name="copy" /> Copiar resumen</button>
      </div>
      <div class="panel stack-sm">
        <span class="eyebrow">Respaldo</span>
        <p class="small">Descarga todos tus datos en un archivo JSON.</p>
        <button class="btn" onClick=${backup}><${Icon} name="download" /> Descargar respaldo</button>
      </div>
    </div>`;
}

export function MoreView() {
  const [tab, setTab] = useState('ejercicios');
  return html`
    <div class="stack">
      <header class="hello"><span class="eyebrow">Catálogo, perfil y Mi Salud</span><h1>${{ ejercicios: 'Ejercicios', perfil: 'Perfil', exportar: 'Mi Salud' }[tab]}</h1></header>
      <div class="seg" role="group" style="align-self:flex-start">
        <button aria-pressed=${tab === 'ejercicios'} onClick=${() => setTab('ejercicios')}>Ejercicios</button>
        <button aria-pressed=${tab === 'perfil'} onClick=${() => setTab('perfil')}>Perfil</button>
        <button aria-pressed=${tab === 'exportar'} onClick=${() => setTab('exportar')}>Mi Salud</button>
      </div>
      ${tab === 'ejercicios' ? html`<${Catalog} />` : tab === 'perfil' ? html`<${ProfileLoader} />` : html`<${Export} />`}
    </div>`;
}
