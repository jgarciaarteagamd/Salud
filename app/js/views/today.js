// Pestaña "Hoy": configurar la sesión con Claude (o empezar vacía) y registrarla en vivo.
import { useStore, saveDoc, deleteDoc, newId, getState } from '../store.js';
import { planSession, errorCopy, getSample } from '../ai.js';
import { MUSCLES, muscleShort } from '../muscles.js';
import { todayKey, fmtDay, isWorkSet } from '../stats.js';
import { SessionEditor, makeItem } from './session.js';
import { Celebration } from './celebrate.js';
import { Icon, Sheet, Thinking, toast, Confirm } from '../ui.js';
const { html, useState, useEffect, useRef } = window.htmPreact;

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const validMuscles = (arr) => (Array.isArray(arr) ? arr.filter((m) => MUSCLES.some((x) => x.id === m)) : []);

async function planToSession(plan, checkin) {
  const lugar = checkin.lugar || 'forus';
  const { exercises, sessions } = getState();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const items = [];
  for (const p of plan.ejercicios || []) {
    let ex = p.exerciseId ? byId[p.exerciseId] : null;
    if (!ex && p.nuevo?.name) {
      const id = `${slug(p.nuevo.name) || 'ejercicio'}-${Math.random().toString(36).slice(2, 5)}`;
      ex = {
        id, name: p.nuevo.name, primary: validMuscles(p.nuevo.primary), secondary: validMuscles(p.nuevo.secondary),
        equipment: p.nuevo.equipment || (lugar === 'freeletics' ? 'Peso corporal' : ''), knee: p.nuevo.knee || 'ok', back: p.nuevo.back || 'ok', modalidad: lugar,
        createdAt: new Date().toISOString(), createdBy: 'claude',
      };
      await saveDoc('exercises', id, ex);
      byId[id] = ex;
    }
    if (!ex) continue;
    const planned = {
      series: Math.max(1, Math.min(8, parseInt(p.series, 10) || 3)), reps: p.reps ?? '', segundos: parseInt(p.segundos, 10) || null,
      peso: p.peso === null || p.peso === undefined || p.peso === '' ? null : Number(p.peso),
      rir: p.rir ?? null, descansoSeg: parseInt(p.descansoSeg, 10) || 90, nota: p.nota || '',
    };
    items.push(makeItem(ex, { origin: 'plan', planned, sessions }));
  }
  return {
    id: newId('s'), date: todayKey(), status: 'plan', source: 'ia', lugar,
    title: plan.titulo || 'Sesión de hoy', enfoque: validMuscles(plan.enfoque),
    plan: {
      razonamiento: plan.razonamiento || '', calentamiento: plan.calentamiento || [], vuelta_calma: plan.vuelta_calma || [],
      precauciones: plan.precauciones || [], generadoEn: new Date().toISOString(), checkin,
    },
    checkin, items, createdAt: new Date().toISOString(),
  };
}

function CheckinSheet({ profile, onClose, onPlanned, lugar = 'forus' }) {
  const fl = lugar === 'freeletics';
  const [c, setC] = useState({ lugar, tiempo: fl ? 20 : (Number(profile?.duracionMin) || 60), energia: 3, dolorRodilla: 0, dolorEspalda: 0, enfoque: '', notas: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [chars, setChars] = useState(0);
  const ctl = useRef(null);
  const up = (k) => (v) => setC({ ...c, [k]: v });
  const focusOpts = fl ? ['Que decida Claude', 'Core', 'Glúteo y pierna', 'Empuje', 'Cuerpo completo', 'Movilidad y estiramientos'] : ['Que decida Claude', 'Torso', 'Pierna', 'Empuje', 'Tirón', 'Cuerpo completo', 'Core y movilidad'];

  async function go() {
    setBusy(true); setErr(''); setChars(0);
    ctl.current = new AbortController();
    try {
      const st = getState();
      const plan = await planSession({ ...st, checkin: { ...c, enfoque: c.enfoque === 'Que decida Claude' ? '' : c.enfoque } }, {
        signal: ctl.current.signal, onText: ({ text }) => setChars(text.length),
      });
      if (!plan || !Array.isArray(plan.ejercicios) || !plan.ejercicios.length) throw { code: 'invalid_json' };
      const session = await planToSession(plan, c);
      await saveDoc('sessions', session.id, session);
      onPlanned(session);
    } catch (e) {
      setErr(errorCopy(e));
    } finally { setBusy(false); }
  }

  return html`
    <${Sheet} title=${fl ? 'Sesión Freeletics en casa' : 'Sesión en Forus'} onClose=${() => { ctl.current?.abort(); onClose(); }}>
      ${busy ? html`
        <div class="stack" style="padding-block:24px">
          <${Thinking} text=${chars ? `Escribiendo tu sesión… (${chars} caracteres)` : 'Claude está revisando tu historial, tus medidas y tus antecedentes…'} />
          <p class="small muted">Puede tardar hasta un minuto.</p>
          <button class="btn" onClick=${() => ctl.current?.abort()}>Detener</button>
        </div>` : html`
        <p class="small muted">Claude arma la sesión con tu historial, el volumen por músculo, tus medidas, tu nutrición y tus antecedentes de rodilla derecha y espalda.</p>
        <label class="field"><span>Tiempo disponible</span>
          <div class="seg" role="group">${(fl ? [15, 20, 30, 45] : [45, 60, 75, 90]).map((t) => html`<button aria-pressed=${c.tiempo == t} onClick=${() => up('tiempo')(t)}>${t} min</button>`)}</div></label>
        <label class="field"><span>Energía hoy</span>
          <div class="seg" role="group">${[1, 2, 3, 4, 5].map((t) => html`<button aria-pressed=${c.energia === t} onClick=${() => up('energia')(t)}>${t}</button>`)}</div></label>
        ${[['dolorRodilla', 'Dolor rodilla derecha'], ['dolorEspalda', 'Dolor de espalda']].map(([k, l]) => html`
          <label class="field"><span>${l}</span><div class="range-row"><input id=${'ck-' + k} type="range" min="0" max="10" value=${c[k]} onInput=${(e) => up(k)(+e.target.value)} /><span class="range-val">${c[k]}</span></div></label>`)}
        <div class="field"><span>Enfoque</span><div class="chips">${focusOpts.map((f) => html`<button class="chip" aria-pressed=${(c.enfoque || 'Que decida Claude') === f} onClick=${() => up('enfoque')(f)}>${f}</button>`)}</div></div>
        <label class="field"><span>Notas para Claude</span><textarea id="ck-notes" class="textarea" value=${c.notas} onInput=${(e) => up('notas')(e.target.value)} placeholder="Ej. dormí mal, quiero terminar con cardio, el press plano siempre está ocupado"></textarea></label>
        ${err && html`<p class="small" style="color:var(--bad)">${err}</p>`}
        <button class="btn btn-primary btn-xl" onClick=${go}><${Icon} name="spark" /> ${err ? 'Intentar de nuevo' : 'Generar sesión'}</button>`}
    </${Sheet}>`;
}

export function TodayView({ go }) {
  const st = useStore();
  const [sheet, setSheet] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const celebration = celebrate && html`<${Celebration} session=${celebrate} onClose=${() => { setCelebrate(null); go('inicio'); }} />`;
  const [hasAI, setHasAI] = useState(true);
  useEffect(() => { getSample().then((s) => setHasAI(!!s)); }, []);

  const open = st.sessions.filter((s) => s.status === 'plan' || s.status === 'en_curso').sort((a, b) => (a.date < b.date ? 1 : -1));
  const current = open[0];
  const savedToday = st.sessions.filter((s) => s.date === todayKey() && s.status === 'guardada');

  async function startEmpty(lugar = 'forus') {
    const s = { id: newId('s'), date: todayKey(), status: 'en_curso', source: 'manual', lugar, title: lugar === 'freeletics' ? 'Freeletics libre' : 'Sesión libre', items: [], createdAt: new Date().toISOString() };
    await saveDoc('sessions', s.id, s);
  }

  if (current) {
    const untouched = current.status === 'plan' && !(current.items || []).some((i) => (i.sets || []).some(isWorkSet));
    return html`
      <div class="stack">
        ${current.date !== todayKey() && html`<div class="panel small">Esta sesión del ${fmtDay(current.date)} quedó sin cerrar. Puedes completarla y guardarla, o descartarla.</div>`}
        <div class="row">
          ${untouched && html`<button class="btn btn-sm" onClick=${() => setSheet('checkin')}><${Icon} name="spark" size="16" /> Regenerar</button>`}
          <button class="btn btn-sm btn-ghost btn-danger" onClick=${() => setSheet('discard')}><${Icon} name="trash" size="16" /> ${untouched ? 'Descartar' : 'Descartar sesión'}</button>
        </div>
        <${SessionEditor} key=${current.id} session=${current} mode="live" onClosed=${(s) => (s ? setCelebrate(s) : go('inicio'))} />
        ${sheet === 'checkin' && html`<${CheckinSheet} lugar=${current.lugar || 'forus'} profile=${st.profile} onClose=${() => setSheet(null)} onPlanned=${async () => { await deleteDoc('sessions', current.id); setSheet(null); toast('Sesión regenerada'); }} />`}
        ${celebration}
        ${sheet === 'discard' && html`<${Confirm} title="Descartar sesión" text=${untouched ? 'Se borra esta sesión planificada. Puedes generar otra cuando quieras.' : 'Se borra esta sesión y las series que registraste en ella. No se puede deshacer.'} confirmLabel="Descartar" onConfirm=${async () => { await deleteDoc('sessions', current.id); toast('Sesión eliminada'); }} onClose=${() => setSheet(null)} />`}
      </div>`;
  }

  return html`
    <div class="stack">
      <header class="hello">
        <span class="eyebrow">${fmtDay(todayKey())} · ${st.profile?.gimnasio || 'Forus'}</span>
        <h1>¿Entrenas hoy?</h1>
        <p class="muted small">Claude arma la sesión según dónde entrenes.</p>
      </header>
      <button class="btn btn-primary btn-xl btn-block" onClick=${() => setSheet('checkin')} disabled=${!hasAI}><${Icon} name="spark" /> Sesión en Forus</button>
      <button class="btn btn-xl btn-block" onClick=${() => setSheet('checkin-fl')} disabled=${!hasAI}><${Icon} name="spark" /> Sesión Freeletics en casa</button>
      ${!hasAI && html`<p class="small muted">Claude no está disponible en esta vista. Abre la app desde claude.ai para generar sesiones; mientras tanto puedes registrar una sesión libre.</p>`}
      <div class="row"><button class="btn grow" onClick=${() => startEmpty('forus')}><${Icon} name="plus" /> Libre en Forus</button><button class="btn grow" onClick=${() => startEmpty('freeletics')}><${Icon} name="plus" /> Libre en casa</button></div>
      ${savedToday.length ? html`
        <section class="section">
          <span class="eyebrow">Ya guardaste hoy</span>
          ${savedToday.map((s) => html`<button class="card row-between" style="text-align:left;cursor:pointer" onClick=${() => go('historial', s.id)}><b>${s.title}</b><${Icon} name="chevron" /></button>`)}
        </section>` : null}
      <section class="panel stack-sm">
        <span class="eyebrow">Cómo funciona</span>
        <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:4px">
          <li>Cuéntale a Claude cuánto tiempo tienes y cómo están tu rodilla y tu espalda.</li>
          <li>Registra cada serie: repeticiones, peso y RIR (repeticiones que te quedaron en reserva).</li>
          <li>Si una máquina está ocupada, sustituye el ejercicio; si no alcanzas, omítelo con su motivo. Claude lo tendrá en cuenta la próxima vez.</li>
          <li>Todo se sincroniza mientras entrenas. Al final, “Guardar sesión”.</li>
        </ul>
      </section>
      ${(sheet === 'checkin' || sheet === 'checkin-fl') && html`<${CheckinSheet} lugar=${sheet === 'checkin-fl' ? 'freeletics' : 'forus'} profile=${st.profile} onClose=${() => setSheet(null)} onPlanned=${() => { setSheet(null); toast('Sesión lista'); }} />`}
      ${celebration}
    </div>`;
}
