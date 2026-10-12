// Pantalla al guardar la sesión: logros concretos de hoy y un mensaje de Claude.
import { getState } from '../store.js';
import { muscleShort } from '../muscles.js';
import { celebrationMessage } from '../ai.js';
import {
  completedSessions, activeItems, isWorkSet, e1rm, num, fmtNum, sessionSetCount, sessionVolume,
  sessionMuscles, weekStreak, todayKey, fmtSet, isPhaseItem,
} from '../stats.js';
import { Sheet, Thinking } from '../ui.js';
const { html, useState, useEffect } = window.htmPreact;

export function sessionAchievements(session, allSessions) {
  const prev = completedSessions(allSessions).filter((s) => s.id !== session.id && s.date <= session.date);
  const best = {}; const last = {};
  for (const s of [...prev].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const it of activeItems(s)) {
      const sets = (it.sets || []).filter(isWorkSet);
      if (!sets.length || isPhaseItem(it)) continue;
      for (const x of sets) { const v = e1rm(x.weight, x.reps, x.rir); if (v) best[it.exerciseId] = Math.max(best[it.exerciseId] || 0, v); }
      last[it.exerciseId] = sets;
    }
  }
  const prs = []; const better = []; const firsts = [];
  for (const it of activeItems(session)) {
    const sets = (it.sets || []).filter(isWorkSet);
    if (!sets.length || isPhaseItem(it)) continue;
    const top = Math.max(0, ...sets.map((x) => e1rm(x.weight, x.reps, x.rir) || 0));
    if (!last[it.exerciseId]) { firsts.push(it.name); continue; }
    if (top && best[it.exerciseId] && top > best[it.exerciseId] * 1.005) {
      prs.push({ name: it.name, gain: (top - best[it.exerciseId]) / best[it.exerciseId] });
      continue;
    }
    const sum = (arr, k) => arr.reduce((a, x) => a + (num(x[k]) || 0), 0);
    const maxW = (arr) => Math.max(0, ...arr.map((x) => num(x.weight) || 0));
    const p = last[it.exerciseId];
    if (maxW(sets) > maxW(p)) better.push(`${it.name}: más peso (${fmtNum(maxW(p))} → ${fmtNum(maxW(sets))} kg)`);
    else if (sum(sets, 'reps') > sum(p, 'reps')) better.push(`${it.name}: más repeticiones (${sum(p, 'reps')} → ${sum(sets, 'reps')})`);
    else if (sum(sets, 'secs') > sum(p, 'secs')) better.push(`${it.name}: más tiempo (${sum(p, 'secs')} → ${sum(sets, 'secs')} s)`);
  }
  const items = session.items || [];
  const planned = items.filter((i) => i.origin !== 'agregado').length;
  const done = items.filter((i) => i.status === 'hecho' || i.status === 'sustituido').length;
  const added = items.filter((i) => i.origin === 'agregado' && (i.sets || []).some(isWorkSet)).length;
  const month = todayKey().slice(0, 7);
  return {
    series: sessionSetCount(session),
    volumenKg: Math.round(sessionVolume(session)),
    duracionMin: num(session.post?.duracion),
    completados: `${done} de ${planned}${added ? ` (+${added} agregados)` : ''}`,
    musculos: sessionMuscles(session).slice(0, 5).map(muscleShort),
    records: prs, mejoras: better, primeraVez: firsts,
    rachaSemanas: weekStreak([...prev, session]),
    sesionesMes: [...prev, session].filter((s) => s.date.startsWith(month) && s.status === 'guardada').length,
  };
}

export function Celebration({ session, onClose }) {
  const st = getState();
  const [facts] = useState(() => sessionAchievements(session, st.sessions));
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const ctl = new AbortController();
    celebrationMessage(session, facts, { signal: ctl.signal }).then(setMsg).catch(() => {}).finally(() => setLoading(false));
    return () => ctl.abort();
  }, []);
  const headline = facts.records.length ? `¡${facts.records.length} récord${facts.records.length > 1 ? 's' : ''} personal${facts.records.length > 1 ? 'es' : ''}!`
    : facts.mejoras.length ? 'Hoy superaste a tu versión anterior' : 'Sesión completada';

  return html`
    <${Sheet} title="¡Bien hecho!" onClose=${onClose}>
      <div class="celebrate">
        <span class="eyebrow">${session.title || 'Sesión'}</span>
        <h2>${headline}</h2>
      </div>
      <div class="kpis">
        <div class="kpi"><span class="eyebrow">Series</span><span class="v">${facts.series}</span></div>
        <div class="kpi"><span class="eyebrow">Ejercicios</span><span class="v" style="font-size:1.4rem">${facts.completados}</span></div>
        ${facts.volumenKg ? html`<div class="kpi"><span class="eyebrow">Kg movidos</span><span class="v">${fmtNum(facts.volumenKg, 0)}</span></div>` : null}
        <div class="kpi"><span class="eyebrow">Este mes</span><span class="v">${facts.sesionesMes}<small>${facts.sesionesMes === 1 ? 'sesión' : 'sesiones'}</small></span></div>
      </div>
      ${facts.records.length ? html`<div class="stack-sm"><span class="eyebrow">Récords</span>${facts.records.map((r) => html`<div class="row-between small"><span>${r.name}</span><span class="chip good">+${fmtNum(r.gain * 100)} % 1RM est.</span></div>`)}</div>` : null}
      ${facts.mejoras.length ? html`<div class="stack-sm"><span class="eyebrow">Mejoras frente a la última vez</span><ul class="guide">${facts.mejoras.map((m) => html`<li>${m}</li>`)}</ul></div>` : null}
      ${facts.primeraVez.length ? html`<div class="stack-sm"><span class="eyebrow">Primera vez</span><p class="small">${facts.primeraVez.join(', ')}. Ya tienes tu referencia para progresar.</p></div>` : null}
      ${facts.musculos.length ? html`<div class="chips">${facts.musculos.map((m) => html`<span class="chip primary">${m}</span>`)}</div>` : null}
      ${facts.rachaSemanas > 1 ? html`<p class="small"><b>${facts.rachaSemanas} semanas seguidas</b> entrenando.</p>` : null}
      <div class="panel">${loading ? html`<${Thinking} text="Claude está mirando tu sesión…" />` : html`<p>${msg || 'Cada sesión registrada es un dato más para progresar con seguridad. Descansa, come tu proteína y nos vemos en la próxima.'}</p>`}</div>
      <button class="btn btn-primary btn-xl" onClick=${onClose}>Listo</button>
    </${Sheet}>`;
}

export { fmtSet };
