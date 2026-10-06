// Inicio: mapa muscular con la evolución de lo trabajado, indicadores y composición corporal.
import { useStore } from '../store.js';
import { MUSCLES, muscleName, rangesFor } from '../muscles.js';
import { Anatomy } from '../anatomy.js';
import { mergeMeasurementsByDate } from '../fields.js';
import {
  completedSessions, setsByMuscle, todayKey, dateKey, addDays, weeklyMuscleSeries, muscleProgress, recentPRs,
  weekStreak, lastTrained, daysBetween, classifyVolume, fmtNum, fmtDay, fmtShort, exerciseHistory, activeItems,
} from '../stats.js';
import { Icon, LineChart, BarChart, ExThumb } from '../ui.js';
const { html, useState, useMemo } = window.htmPreact;

const HEAT = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];
const MODES = {
  semana: { label: 'Semana', legend: [[0, 'Sin trabajo'], [1, 'Bajo el rango'], [3, 'En rango'], [4, 'Sobre el rango']] },
  mes: { label: '4 semanas', legend: [[0, 'Sin trabajo'], [1, 'Bajo el rango'], [3, 'En rango'], [4, 'Sobre el rango']] },
  fuerza: { label: 'Fuerza', legend: [[0, 'Sin datos'], [1, 'Bajó o igual'], [2, '+0–3 %'], [3, '+3–10 %'], [4, '> +10 %']] },
};

function Kpi({ label, value, unit, delta, deltaGood = 'up', hint }) {
  let cls = 'flat'; let txt = hint || '';
  if (delta != null && Number.isFinite(delta)) {
    const up = delta > 0.0001; const down = delta < -0.0001;
    const good = deltaGood === 'up' ? up : down;
    cls = up || down ? (good ? 'up' : 'down') : 'flat';
    txt = `${delta > 0 ? '+' : ''}${fmtNum(delta)}${unit ? ` ${unit}` : ''} vs. anterior`;
  }
  return html`<div class="kpi"><span class="eyebrow">${label}</span><span class="v">${value}${unit && value !== '—' ? html`<small>${unit}</small>` : null}</span><span class=${'delta ' + cls}>${txt}</span></div>`;
}

export function DashboardView({ go }) {
  const st = useStore();
  const [mode, setMode] = useState('semana');
  const [sel, setSel] = useState('pecho');
  const done = useMemo(() => completedSessions(st.sessions), [st.sessions]);
  const MUSCLE = useMemo(() => rangesFor(st.profile), [st.profile]);
  const today = todayKey();

  const week = useMemo(() => setsByMuscle(done, dateKey(addDays(new Date(), -6)), today), [done]);
  const month = useMemo(() => {
    const s = setsByMuscle(done, dateKey(addDays(new Date(), -27)), today);
    return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v / 4]));
  }, [done]);
  const prog = useMemo(() => Object.fromEntries(MUSCLES.map((m) => [m.id, muscleProgress(done, m.id)])), [done]);
  const lt = useMemo(() => lastTrained(done), [done]);

  const fills = useMemo(() => {
    const f = {};
    for (const m of MUSCLES) {
      if (mode === 'fuerza') {
        const p = prog[m.id];
        f[m.id] = HEAT[p == null ? 0 : p <= 0 ? 1 : p <= 0.03 ? 2 : p <= 0.10 ? 3 : 4];
      } else {
        const v = (mode === 'semana' ? week : month)[m.id];
        f[m.id] = HEAT[classifyVolume(v, MUSCLE[m.id])];
      }
    }
    return f;
  }, [mode, week, month, prog, MUSCLE]);

  const thisMonth = today.slice(0, 7);
  const sessMonth = done.filter((s) => s.date.startsWith(thisMonth) && s.status === 'guardada').length;
  const sets7 = Object.entries(week).reduce((a, [k, v]) => a + (MUSCLE[k] ? v : 0), 0);
  const streak = weekStreak(done);
  const meas = [...st.measurements].sort((a, b) => (a.date < b.date ? -1 : 1));
  const withW = mergeMeasurementsByDate(st.measurements).filter((m) => m.valores.peso != null); // un registro por día
  const lastW = withW[withW.length - 1]; const prevW = withW[withW.length - 2];
  const open = st.sessions.find((s) => s.status === 'plan' || s.status === 'en_curso');
  const name = st.profile?.nombre?.split(' ')[0];

  const m = MUSCLE[sel];
  const series = useMemo(() => weeklyMuscleSeries(done, sel, 8), [done, sel]);
  const topEx = useMemo(() => {
    const ids = new Map();
    for (const s of done) for (const it of activeItems(s)) if ((it.primary || []).includes(sel)) ids.set(it.exerciseId, it.name);
    return [...ids.entries()].map(([id, nm]) => {
      const h = exerciseHistory(done, id).filter((r) => r.best);
      return { id, name: nm, h, last: h[h.length - 1] };
    }).filter((x) => x.h.length).sort((a, b) => b.h.length - a.h.length).slice(0, 3);
  }, [done, sel]);
  const exById = Object.fromEntries(st.exercises.map((e) => [e.id, e]));
  const prs = useMemo(() => recentPRs(done, 5), [done]);

  // Grasa y músculo de una sola fuente (el reloj si hay datos); mezclar báscula y reloj no es comparable.
  const bodyPts = (key, tipo) => {
    let rows = meas.filter((x) => x.valores?.[key] != null);
    if (tipo && rows.some((x) => x.tipo === tipo)) rows = rows.filter((x) => x.tipo === tipo);
    const byDay = new Map(); for (const x of rows) byDay.set(x.date, Number(x.valores[key]));
    return [...byDay.entries()].slice(-12).map(([d, y]) => ({ x: fmtShort(d), y }));
  };
  const pesoPts = bodyPts('peso', 'reloj'); const grasaPts = bodyPts('grasaPct', 'reloj');
  const muscKey = meas.some((x) => x.valores?.musculoEsqueletico != null) ? 'musculoEsqueletico' : 'masaMuscular';
  const muscPts = bodyPts(muscKey, 'reloj');
  const sortedMuscles = MUSCLES.map((x) => MUSCLE[x.id]).sort((a, b) => (week[b.id] / (b.max || 1)) - (week[a.id] / (a.max || 1)));

  return html`
    <div class="stack">
      <header class="hello">
        <span class="eyebrow">${fmtDay(today)}</span>
        <h1>${name ? `Hola, ${name}` : 'Tu progreso'}</h1>
      </header>

      <button class="cta-today" style="border:0;text-align:left;cursor:pointer" onClick=${() => go('hoy')}>
        <div class="stack-sm" style="gap:2px">
          <span class="eyebrow">${open ? 'Sesión en curso' : '¿Vas a Forus hoy?'}</span>
          <h3>${open ? open.title || 'Continuar sesión' : 'Configurar sesión con Claude'}</h3>
        </div>
        <${Icon} name=${open ? 'chevron' : 'spark'} size="26" />
      </button>

      <div class="kpis">
        <${Kpi} label="Sesiones del mes" value=${sessMonth} hint=${done.length ? `${done.length} en total` : 'Registra la primera'} />
        <${Kpi} label="Series · 7 días" value=${fmtNum(sets7, 0)} hint="Principal = 1, secundario = ½" />
        <${Kpi} label="Racha" value=${streak} unit=${streak === 1 ? 'semana' : 'semanas'} hint="Semanas seguidas entrenando" />
        <${Kpi} label="Peso" value=${lastW ? fmtNum(Number(lastW.valores.peso)) : '—'} unit="kg" delta=${lastW && prevW ? Number(lastW.valores.peso) - Number(prevW.valores.peso) : null} deltaGood="down" hint=${lastW ? fmtShort(lastW.date) : 'Sin medidas'} />
      </div>

      <section class="section">
        <div class="section-head">
          <h2>Mapa muscular</h2>
          <div class="seg" role="group" aria-label="Vista del mapa">
            ${Object.entries(MODES).map(([k, v]) => html`<button aria-pressed=${mode === k} onClick=${() => setMode(k)}>${v.label}</button>`)}
          </div>
        </div>
        <div class="anat-wrap">
          <div class="anat-card stack-sm">
            <${Anatomy} fills=${fills} selected=${sel} onSelect=${setSel} label=${muscleName} />
            <div class="legend">${MODES[mode].legend.map(([i, l]) => html`<span class="row" style="gap:4px"><i class="sw" style=${`background:${HEAT[i]}`}></i>${l}</span>`)}</div>
            <p class="xs muted">${mode === 'fuerza' ? 'Cambio del mejor 1RM estimado (ajustado por RIR): últimas 4 semanas frente a las 4 anteriores.' : mode === 'mes' ? 'Promedio de series semanales de las últimas 4 semanas frente a la meta semanal.' : `Series de los últimos 7 días frente a ${MUSCLE.pecho.personal ? 'tus metas semanales' : 'el rango semanal recomendado'}.`} Toca un músculo para ver su detalle.</p>
          </div>

          <div class="card stack">
            <div class="row-between">
              <div class="stack-sm" style="gap:2px"><span class="eyebrow">${m.group}</span><h3>${m.name}</h3></div>
              <div style="text-align:right">
                <div class="kpi" style="border:0;padding:0;background:none"><span class="v">${fmtNum(week[sel])}<small>${m.max ? `/ ${m.min}–${m.max}` : ''}</small></span></div>
                <span class="xs muted">series esta semana</span>
              </div>
            </div>
            <div class="row small muted">
              <span>${lt[sel] ? `Último trabajo: hace ${daysBetween(lt[sel], today)} d` : 'Aún sin trabajar'}</span>
              ${prog[sel] != null && html`<span class=${'chip ' + (prog[sel] > 0 ? 'good' : 'warn')}>Fuerza ${prog[sel] > 0 ? '+' : ''}${fmtNum(prog[sel] * 100)} %</span>`}
            </div>
            <div class="stack-sm"><span class="eyebrow">Series por semana · banda = rango objetivo</span><${BarChart} points=${series} band=${m.max ? [m.min, m.max] : null} /></div>
            ${topEx.length ? html`
              <div class="stack-sm">
                <span class="eyebrow">Ejercicios · 1RM estimado</span>
                ${topEx.map((x) => html`
                  <div class="row" style="align-items:center;flex-wrap:nowrap">
                    <${ExThumb} ex=${exById[x.id]} />
                    <div class="grow"><b class="small">${x.name}</b><div class="xs muted num">${fmtNum(x.last.best.e1rm)} kg · mejor serie ${x.last.best.reps}×${fmtNum(x.last.best.weight)} kg</div></div>
                    <div style="width:96px"><${LineChart} height=${54} series=${[{ name: x.name, points: x.h.slice(-8).map((r) => ({ x: '', y: Math.round(r.best.e1rm * 10) / 10 })) }]} /></div>
                  </div>`)}
              </div>` : html`<p class="small muted">Cuando registres series de ${m.name.toLowerCase()} verás aquí la evolución de cada ejercicio.</p>`}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Volumen semanal</h2><span class="xs muted">últimos 7 días · banda verde = rango</span></div>
        <div class="card mlist" style="padding:6px 10px">
          ${sortedMuscles.map((mm) => {
            const v = week[mm.id]; const scale = Math.max((mm.max || 4) * 1.25, v || 0);
            return html`<button class=${'mrow' + (sel === mm.id ? ' sel' : '')} onClick=${() => setSel(mm.id)}>
              <span class="name">${mm.short || mm.name}</span>
              <span class="bar"><span class="band" style=${`left:${(mm.min / scale) * 100}%;width:${((mm.max - mm.min) / scale) * 100}%`}></span><span class="fill" style=${`width:${Math.min(100, ((v || 0) / scale) * 100)}%;background:${HEAT[classifyVolume(v, mm)]}`}></span></span>
              <span class="val">${fmtNum(v)}</span></button>`;
          })}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Composición corporal</h2><button class="btn btn-sm" onClick=${() => go('cuerpo')}>Registrar medidas</button></div>
        ${pesoPts.length || grasaPts.length ? html`
          <div class="anat-wrap">
            <div class="card stack-sm"><span class="eyebrow">Peso · kg</span><${LineChart} series=${[{ name: 'Peso', points: pesoPts }]} /></div>
            <div class="card stack-sm"><span class="eyebrow">Grasa % y ${muscKey === 'musculoEsqueletico' ? 'músculo esquelético' : 'masa muscular'} kg</span>
              ${grasaPts.length ? html`<${LineChart} series=${[{ name: 'Grasa %', points: grasaPts }]} unit="%" />` : null}
              ${muscPts.length ? html`<${LineChart} series=${[{ name: 'Masa muscular', points: muscPts }]} />` : null}
            </div>
          </div>` : html`<div class="empty"><p>Sube una captura de tu antropometría, báscula o Samsung Health y Claude extrae los valores.</p><button class="btn" onClick=${() => go('cuerpo')}><${Icon} name="camera" /> Subir primera medida</button></div>`}
      </section>

      <section class="section">
        <h2>Récords recientes</h2>
        ${prs.length ? html`<div class="card mlist" style="padding:4px 12px">${prs.map((p) => html`
          <div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
            <div><b class="small">${p.name}</b><div class="xs muted">${fmtDay(p.date)} · ${p.set.reps}×${p.set.weight} kg${p.set.rir !== '' && p.set.rir != null ? ` RIR ${p.set.rir}` : ''}</div></div>
            <span class="chip good num">+${fmtNum(p.gain * 100)} %</span>
          </div>`)}</div>`
          : html`<p class="small muted">Cuando superes tu mejor 1RM estimado en un ejercicio aparecerá aquí.</p>`}
      </section>
    </div>`;
}
