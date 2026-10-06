// Piezas de interfaz compartidas: íconos, hoja modal, aviso, miniatura de ejercicio, gráficos SVG.
import { MiniBody } from './anatomy.js';
import { exerciseImage } from './store.js';
const { html, useState, useEffect } = window.htmPreact;

const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  today: 'M6 4v16M18 4v16M3 8v8M21 8v8M6 12h12',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  body: 'M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 10h14M12 10v6M8 22l4-6 4 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  skip: 'M5 5l10 7-10 7zM19 5v14',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  timer: 'M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  note: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
};
export function Icon({ name, size }) {
  return html`<svg viewBox="0 0 24 24" width=${size || 20} height=${size || 20} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[name]} /></svg>`;
}

export function Sheet({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return html`
    <div class="sheet-back" onClick=${(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label=${title} style=${wide ? 'max-width:760px' : ''}>
        <div class="sheet-head">
          <h3>${title}</h3>
          <button class="icon-btn" onClick=${onClose} aria-label="Cerrar"><${Icon} name="x" /></button>
        </div>
        ${children}
      </div>
    </div>`;
}

let toastSet = null;
export function toast(msg) { toastSet?.(msg); }
export function ToastHost() {
  const [msg, setMsg] = useState('');
  useEffect(() => { toastSet = setMsg; return () => { toastSet = null; }; }, []);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 2600); return () => clearTimeout(t); }, [msg]);
  return msg ? html`<div class="toast" role="status">${msg}</div>` : null;
}

// Confirmación dentro de la página (el visor no muestra confirm()).
export function Confirm({ title, text, confirmLabel = 'Eliminar', onConfirm, onClose }) {
  return html`
    <${Sheet} title=${title} onClose=${onClose}>
      <p>${text}</p>
      <div class="row">
        <button class="btn btn-primary" onClick=${() => { onConfirm(); onClose(); }}>${confirmLabel}</button>
        <button class="btn" onClick=${onClose}>Cancelar</button>
      </div>
    </${Sheet}>`;
}

export function ExThumb({ ex, item }) {
  const [broken, setBroken] = useState(false);
  const src = exerciseImage(ex);
  const primary = item?.primary || ex?.primary || [];
  const secondary = item?.secondary || ex?.secondary || [];
  useEffect(() => setBroken(false), [src]);
  return html`<div class="ex-thumb">${src && !broken
    ? html`<img src=${src} alt="" loading="lazy" onError=${() => setBroken(true)} />`
    : html`<${MiniBody} primary=${primary} secondary=${secondary} />`}</div>`;
}
export function ExImage({ ex }) {
  const [broken, setBroken] = useState(false);
  const src = exerciseImage(ex);
  useEffect(() => setBroken(false), [src]);
  return src && !broken
    ? html`<img src=${src} alt=${ex?.name || ''} loading="lazy" onError=${() => setBroken(true)} />`
    : html`<${MiniBody} primary=${ex?.primary || []} secondary=${ex?.secondary || []} />`;
}

/* ---------- gráficos ---------- */
const niceStep = (span, ticks) => {
  const raw = span / Math.max(ticks, 1);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
};
function scaleY(values, ticks = 3, zero = false) {
  let min = Math.min(...values); let max = Math.max(...values);
  if (zero) min = Math.min(0, min);
  if (min === max) { min -= 1; max += 1; }
  const step = niceStep(max - min, ticks);
  const lo = Math.floor(min / step) * step; const hi = Math.ceil(max / step) * step;
  const t = []; for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(6));
  return { lo, hi, ticks: t };
}
const fmtTick = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10));

// Línea temporal con uno o dos series. points: [{x: etiqueta, y}] alineados por índice.
export function LineChart({ series, height = 150, unit = '' }) {
  const all = series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => v != null);
  if (all.length < 1) return html`<p class="muted small">Sin datos todavía.</p>`;
  const W = 320; const H = height; const L = 34; const R = 10; const T = 10; const B = 22;
  const n = Math.max(...series.map((s) => s.points.length));
  const { lo, hi, ticks } = scaleY(all, 3);
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const labels = series[0].points;
  const every = Math.ceil(labels.length / 5);
  return html`
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label=${series.map((s) => s.name).join(', ')}>
      ${ticks.map((t) => html`<line class="grid" x1=${L} x2=${W - R} y1=${y(t)} y2=${y(t)} /><text x=${L - 6} y=${y(t) + 3} text-anchor="end">${fmtTick(t)}</text>`)}
      ${labels.map((p, i) => (i % every === 0 || i === labels.length - 1) && html`<text x=${x(i)} y=${H - 6} text-anchor="middle">${p.x}</text>`)}
      ${series.map((s, si) => {
        const pts = s.points.map((p, i) => (p.y == null ? null : [x(i), y(p.y)])).filter(Boolean);
        if (!pts.length) return null;
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        const area = si === 0 && pts.length > 1 ? `${d} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z` : null;
        const last = pts[pts.length - 1];
        return html`
          ${area && html`<path class="area" d=${area} />`}
          <path class=${'line' + (si ? ' alt' : '')} d=${d} />
          ${pts.length < 12 && pts.map((p) => html`<circle class=${'dot' + (si ? ' alt' : '')} cx=${p[0]} cy=${p[1]} r="2.5" />`)}
          <circle class=${'dot' + (si ? ' alt' : '')} cx=${last[0]} cy=${last[1]} r="4" />
          <text x=${Math.min(last[0], W - R - 2)} y=${last[1] - 8} text-anchor="end" style="fill:var(--ink);font-weight:600">${fmtTick(s.points.filter((p) => p.y != null).slice(-1)[0].y)}${unit}</text>`;
      })}
    </svg>`;
}

// Barras verticales con banda de rango objetivo opcional.
export function BarChart({ points, height = 130, band }) {
  const W = 320; const H = height; const L = 26; const R = 6; const T = 8; const B = 22;
  const vals = points.map((p) => p.value);
  const { hi, ticks } = scaleY([...vals, band?.[1] ?? 0, 1], 3, true);
  const n = points.length; const slot = (W - L - R) / n; const bw = Math.min(26, slot * 0.62);
  const y = (v) => T + (H - T - B) * (1 - v / hi);
  return html`
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Series por semana">
      ${band && html`<rect x=${L} width=${W - L - R} y=${y(band[1])} height=${y(band[0]) - y(band[1])} fill="var(--good-soft)" />`}
      ${ticks.map((t) => html`<line class="grid" x1=${L} x2=${W - R} y1=${y(t)} y2=${y(t)} /><text x=${L - 5} y=${y(t) + 3} text-anchor="end">${fmtTick(t)}</text>`)}
      ${points.map((p, i) => html`
        <rect class=${'barr' + (i === n - 1 ? '' : ' dim')} x=${L + i * slot + (slot - bw) / 2} width=${bw} y=${y(p.value)} height=${Math.max(0, y(0) - y(p.value))} rx="3" />
        ${(i % 2 === n % 2 || i === n - 1) ? html`<text x=${L + i * slot + slot / 2} y=${H - 6} text-anchor="middle">${p.label}</text>` : null}`)}
    </svg>`;
}

export function Thinking({ text = 'Claude está pensando…' }) {
  return html`<div class="thinking"><span class="pulse"></span><span>${text}</span></div>`;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); return true; } catch { toast('Selecciona el texto y cópialo manualmente'); return false; }
}
