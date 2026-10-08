// Arranque y navegación por pestañas (#inicio, #hoy, #historial, #cuerpo, #mas).
import { initStore, useStore } from './store.js';
import { DashboardView } from './views/dashboard.js';
import { TodayView } from './views/today.js';
import { HistoryView } from './views/history.js';
import { BodyView } from './views/body.js';
import { MoreView } from './views/more.js';
import { Icon, ToastHost } from './ui.js';
const { html, render, useState, useEffect } = window.htmPreact;

const TABS = [
  ['inicio', 'Inicio', 'home'],
  ['hoy', 'Hoy', 'today'],
  ['historial', 'Historial', 'history'],
  ['cuerpo', 'Cuerpo', 'body'],
  ['mas', 'Más', 'more'],
];
const readHash = () => { const h = (location.hash || '').slice(1); return TABS.some(([k]) => k === h) ? h : 'inicio'; };

function App() {
  const st = useStore();
  const [tab, setTab] = useState(readHash);
  const [param, setParam] = useState(null);
  useEffect(() => { const f = () => setTab(readHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = (t, p = null) => {
    setTab(t); setParam(p);
    try { history.replaceState(null, '', `#${t}`); } catch { /* el visor puede bloquearlo */ }
    window.scrollTo({ top: 0 });
  };
  const ready = ['exercises', 'sessions', 'profile'].every((k) => st.loaded[k]);

  let view;
  if (!ready) view = html`<div class="boot"><p class="boot-mark">FITNESS LOG</p><p class="muted">Sincronizando…</p></div>`;
  else if (tab === 'hoy') view = html`<${TodayView} go=${go} />`;
  else if (tab === 'historial') view = html`<${HistoryView} go=${go} param=${param} />`;
  else if (tab === 'cuerpo') view = html`<${BodyView} go=${go} />`;
  else if (tab === 'mas') view = html`<${MoreView} go=${go} />`;
  else view = html`<${DashboardView} go=${go} />`;

  return html`
    <div class="shell">
      <div class="topbar">
        <div class="brand"><span class="brand-dot"></span>FITNESS LOG</div>
        <div class=${'sync' + (st.mode === 'cloud' && !st.error ? '' : ' off')} title=${st.error || ''}>
          <i></i>${st.mode === 'cloud' ? (st.error ? 'Problema al sincronizar' : 'Sincronizado') : 'Solo en este dispositivo'}
        </div>
      </div>
      ${view}
    </div>
    <div class="tabbar"><nav aria-label="Secciones">
      ${TABS.map(([k, label, icon]) => html`<button class="tab" aria-current=${tab === k ? 'page' : undefined} onClick=${() => go(k)}><${Icon} name=${icon} /><span>${label}</span></button>`)}
    </nav></div>
    <${ToastHost} />`;
}

const root = document.getElementById('app');
root.innerHTML = '';
render(html`<${App} />`, root);
initStore();
