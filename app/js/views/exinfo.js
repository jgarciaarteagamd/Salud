// Ficha de un ejercicio: animación (posición inicial ↔ final), explicación paso a paso,
// precauciones para rodilla/espalda y última vez que lo hiciste.
import { getState, saveDoc, exerciseImage } from '../store.js';
import { muscleShort, SAFETY } from '../muscles.js';
import { exerciseGuide, getSample, errorCopy } from '../ai.js';
import { completedSessions, lastPerformance, todayKey, fmtDay, fmtSet } from '../stats.js';
import { Sheet, ExImage, Thinking, Icon } from '../ui.js';
const { html, useState, useEffect, useRef } = window.htmPreact;

// Alterna los dos fotogramas con un fundido; sin fotogramas muestra el dibujo fijo.
export function ExerciseMotion({ ex, big }) {
  const frames = ex?.frames?.length === 2 && !ex.imageAsset ? ex.frames : null;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!frames || !playing) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;
    const t = setInterval(() => setI((x) => 1 - x), 1300);
    return () => clearInterval(t);
  }, [frames?.[0], playing]);
  if (!frames) return html`<div class=${'motion' + (big ? ' big' : '')}><${ExImage} ex=${ex} /></div>`;
  return html`
    <div class=${'motion' + (big ? ' big' : '')}>
      ${frames.map((src, k) => html`<img src=${src} alt=${k ? 'Posición final' : 'Posición inicial'} class=${i === k ? 'on' : ''} />`)}
      <span class="motion-tag">${i ? 'Final' : 'Inicio'}</span>
      <button class="motion-btn" aria-label=${playing ? 'Pausar animación' : 'Reproducir animación'} onClick=${() => setPlaying(!playing)}>${playing ? '❚❚' : '▶'}</button>
    </div>`;
}

const List = ({ title, items, ordered }) => (items?.length ? html`
  <div class="stack-sm"><span class="eyebrow">${title}</span>
    ${ordered ? html`<ol class="guide">${items.map((x) => html`<li>${x}</li>`)}</ol>` : html`<ul class="guide">${items.map((x) => html`<li>${x}</li>`)}</ul>`}
  </div>` : null);

export function ExerciseInfo({ exerciseId, onClose, onEdit }) {
  const st = getState();
  const ex = st.exercises.find((e) => e.id === exerciseId);
  const [guide, setGuide] = useState(ex?.guia || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hasAI, setHasAI] = useState(false);
  const ctl = useRef(null);
  useEffect(() => { getSample().then((s) => setHasAI(!!s)); }, []);

  async function generate() {
    setBusy(true); setErr(''); ctl.current = new AbortController();
    try {
      const g = await exerciseGuide(ex, st.profile, { signal: ctl.current.signal });
      if (!g || !Array.isArray(g.ejecucion)) throw { code: 'invalid_json' };
      setGuide(g);
      await saveDoc('exercises', ex.id, { ...ex, guia: { ...g, generadoEn: new Date().toISOString() } });
    } catch (e) { setErr(errorCopy(e)); } finally { setBusy(false); }
  }
  // Primera vez que se abre: se genera sola y queda guardada para siempre.
  useEffect(() => { if (hasAI && ex && !ex.guia && !busy) generate(); }, [hasAI]);

  if (!ex) return html`<${Sheet} title="Ejercicio" onClose=${onClose}><p class="muted">Este ejercicio ya no está en el catálogo.</p></${Sheet}>`;
  const lp = lastPerformance(completedSessions(st.sessions), ex.id, todayKey());

  return html`
    <${Sheet} title=${ex.name} onClose=${() => { ctl.current?.abort(); onClose(); }} wide>
      <${ExerciseMotion} ex=${ex} big />
      ${ex.nombreEs && html`<p class="muted small" style="margin-top:-6px">${ex.nombreEs}</p>`}
      <div class="chips">
        ${(ex.primary || []).map((m) => html`<span class="chip primary">${muscleShort(m)}</span>`)}
        ${(ex.secondary || []).map((m) => html`<span class="chip">${muscleShort(m)}</span>`)}
        ${ex.knee && ex.knee !== 'ok' ? html`<span class=${'chip ' + SAFETY[ex.knee].cls}>Rodilla: ${SAFETY[ex.knee].label.toLowerCase()}</span>` : null}
        ${ex.back && ex.back !== 'ok' ? html`<span class=${'chip ' + SAFETY[ex.back].cls}>Espalda: ${SAFETY[ex.back].label.toLowerCase()}</span>` : null}
        ${ex.unilateral ? html`<span class="chip">Por lado</span>` : null}
        ${ex.medida === 'tiempo' ? html`<span class="chip">En segundos</span>` : null}
      </div>
      ${ex.equipment && html`<p class="small"><b>Equipo:</b> ${ex.equipment}</p>`}
      ${ex.cues && html`<p class="plan-note small">${ex.cues}</p>`}

      ${guide ? html`
        <div class="stack">
          ${guide.resumen && html`<p>${guide.resumen}</p>`}
          <${List} title="Preparación" items=${guide.preparacion} />
          <${List} title="Cómo se hace" items=${guide.ejecucion} ordered />
          ${guide.respiracion && html`<div class="stack-sm"><span class="eyebrow">Respiración</span><p class="small">${guide.respiracion}</p></div>`}
          ${guide.sensacion && html`<div class="stack-sm"><span class="eyebrow">Dónde lo sientes</span><p class="small">${guide.sensacion}</p></div>`}
          <${List} title="Errores comunes" items=${guide.errores} />
          ${guide.cuidados?.length ? html`<div class="panel stack-sm"><span class="eyebrow">Cuidados para tu rodilla y espalda</span><ul class="guide">${guide.cuidados.map((x) => html`<li>${x}</li>`)}</ul></div>` : null}
          ${guide.confusion && html`<div class="stack-sm"><span class="eyebrow">No lo confundas</span><p class="small">${guide.confusion}</p></div>`}
          ${hasAI && html`<button class="btn btn-sm btn-ghost" style="align-self:flex-start" onClick=${generate} disabled=${busy}>${busy ? 'Reescribiendo…' : 'Reescribir explicación'}</button>`}
        </div>` : busy ? html`<${Thinking} text="Claude está escribiendo la explicación (solo la primera vez)…" />`
        : hasAI ? html`<button class="btn btn-primary" onClick=${generate}><${Icon} name="spark" /> Explicar este ejercicio</button>`
        : html`<p class="small muted">Abre la app en claude.ai para que Claude escriba la explicación paso a paso.</p>`}
      ${err && html`<p class="small" style="color:var(--bad)">${err}</p>`}

      ${lp && html`<p class="small muted num">Última vez (${fmtDay(lp.date)}): ${lp.sets.map(fmtSet).join(', ')}</p>`}
      ${onEdit && html`<button class="btn" onClick=${() => onEdit(ex)}><${Icon} name="edit" /> Editar ejercicio</button>`}
    </${Sheet}>`;
}

export { exerciseImage };
