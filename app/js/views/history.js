// Historial: todas las sesiones guardadas, agrupadas por mes; cada una se puede abrir y corregir.
import { useStore } from '../store.js';
import { MUSCLES, muscleShort } from '../muscles.js';
import { completedSessions, monthLabel, parseDay, DIAS_CORTOS, sessionSetCount, sessionVolume, sessionMuscles, sessionChanges, fmtNum } from '../stats.js';
import { SessionEditor } from './session.js';
import { Icon } from '../ui.js';
const { html, useState, useMemo } = window.htmPreact;

export function HistoryView({ param, go }) {
  const st = useStore();
  const [m, setM] = useState('');
  const sessions = useMemo(() => completedSessions(st.sessions).filter((s) => s.status === 'guardada'), [st.sessions]);
  const opened = param ? st.sessions.find((s) => s.id === param) : null;

  if (opened) {
    return html`
      <div class="stack">
        <button class="btn btn-ghost btn-sm" style="align-self:flex-start" onClick=${() => go('historial')}><${Icon} name="back" size="16" /> Historial</button>
        <${SessionEditor} key=${opened.id} session=${opened} mode="edit" onClosed=${() => go('historial')} />
      </div>`;
  }

  const list = sessions.filter((s) => !m || sessionMuscles(s).includes(m));
  const groups = [];
  for (const s of list) {
    const k = s.date.slice(0, 7);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, label: monthLabel(s.date), items: [] });
    groups[groups.length - 1].items.push(s);
  }

  return html`
    <div class="stack">
      <header class="hello"><span class="eyebrow">${sessions.length} sesiones guardadas</span><h1>Historial</h1></header>
      <div class="chips">
        <button class="chip" aria-pressed=${!m} onClick=${() => setM('')}>Todas</button>
        ${MUSCLES.map((mm) => html`<button class="chip" aria-pressed=${m === mm.id} onClick=${() => setM(m === mm.id ? '' : mm.id)}>${muscleShort(mm.id)}</button>`)}
      </div>
      ${!list.length && html`<div class="empty"><p>${sessions.length ? 'Ninguna sesión trabajó ese músculo.' : 'Aún no hay sesiones guardadas. Configura la de hoy y al terminar toca “Guardar sesión”.'}</p>${!sessions.length && html`<button class="btn btn-primary" onClick=${() => go('hoy')}>Ir a Hoy</button>`}</div>`}
      ${groups.map((g) => html`
        <div class="stack-sm">
          <div class="month">${g.label}</div>
          ${g.items.map((s) => {
            const d = parseDay(s.date); const ch = sessionChanges(s); const mus = sessionMuscles(s);
            return html`
              <button class="card hcard" onClick=${() => go('historial', s.id)}>
                <div class="hdate"><b>${d.getDate()}</b><span>${DIAS_CORTOS[d.getDay()]}</span></div>
                <div class="stack-sm" style="gap:4px;min-width:0">
                  <b style="font-family:var(--f-display);font-size:1.15rem;font-weight:600">${s.title || 'Sesión'}</b>
                  <span class="xs muted num">${sessionSetCount(s)} series · ${fmtNum(sessionVolume(s), 0)} kg${s.post?.rpe ? ` · RPE ${s.post.rpe}` : ''}</span>
                  <div class="chips">
                    ${mus.slice(0, 4).map((x) => html`<span class="chip">${muscleShort(x)}</span>`)}
                    ${ch.sustituidos ? html`<span class="chip primary">${ch.sustituidos} sustituido${ch.sustituidos > 1 ? 's' : ''}</span>` : null}
                    ${ch.omitidos ? html`<span class="chip warn">${ch.omitidos} omitido${ch.omitidos > 1 ? 's' : ''}</span>` : null}
                    ${ch.agregados ? html`<span class="chip good">${ch.agregados} agregado${ch.agregados > 1 ? 's' : ''}</span>` : null}
                    ${s.editLog?.length ? html`<span class="chip">Corregida</span>` : null}
                  </div>
                </div>
                <${Icon} name="chevron" />
              </button>`;
          })}
        </div>`)}
    </div>`;
}
