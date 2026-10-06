// Figura anatómica (frente y espalda) dibujada en SVG. Cada músculo es una forma con su id;
// se dibuja la mitad izquierda y se refleja para la derecha.
const { html } = window.htmPreact;

const W = 200;
const MIRROR = `matrix(-1 0 0 1 ${W} 0)`;

const FRONT = [
  ['trapecio', 'M90,54 C86,60 78,64 68,68 C76,70 86,68 92,64 Z'],
  ['deltoide_lat', 'M66,68 C56,70 50,80 50,94 C50,98 51,101 52,103 C56,98 59,90 62,82 C63,77 64,72 66,68 Z'],
  ['deltoide_ant', 'M68,68 C76,68 82,72 84,76 C78,84 70,94 62,100 C58,102 54,103 52,103 C56,96 60,86 62,80 C64,74 66,70 68,68 Z'],
  ['pecho', 'M86,74 C92,72 98,72 99.5,74 L99.5,106 C94,110 84,110 76,106 C72,104 68,102 64,100 C72,92 80,82 86,74 Z'],
  ['biceps', 'M52,106 C58,102 64,102 66,106 C68,118 66,130 62,140 C57,142 52,141 49,138 C47,126 48,114 52,106 Z'],
  ['antebrazo', 'M48,142 C54,145 60,145 63,143 C63,156 59,170 55,184 L47,184 C44,170 44,155 48,142 Z'],
  ['oblicuos', 'M72,110 C78,112 84,113 86,113 C86,132 87,150 89,166 C84,166 78,162 74,156 C71,142 70,126 72,110 Z'],
  ['abdomen', 'M88,112 C93,113 97,113 99.5,113 L99.5,176 C95,178 92,176 90,172 C88,152 87,132 88,112 Z'],
  ['abductores', 'M73,160 C78,166 82,172 84,180 C80,184 76,190 74,196 C71,184 70,172 73,160 Z'],
  ['cuadriceps', 'M74,198 C78,188 84,182 90,184 C92,204 93,226 92,248 C91,256 90,262 88,266 C83,268 78,267 76,262 C71,242 70,220 74,198 Z'],
  ['aductores', 'M91,184 C95,184 98,188 99,192 C99,208 97,224 94,240 C93,222 92,202 91,184 Z'],
  ['pantorrillas', 'M76,286 C80,282 88,282 91,286 C92,304 90,324 87,348 L81,350 C77,330 74,306 76,286 Z'],
];
const FRONT_BASE = [
  ['ellipse', { cx: 100, cy: 28, rx: 15, ry: 19 }],
  ['path', { d: 'M92,42 L108,42 L111,62 L89,62 Z' }],
  ['path', { d: 'M70,66 C84,62 116,62 130,66 L134,100 C130,124 127,146 125,160 L128,196 L72,196 L75,160 C73,146 70,124 66,100 Z' }],
  ['ellipse', { cx: 51, cy: 194, rx: 6, ry: 10 }], ['ellipse', { cx: 149, cy: 194, rx: 6, ry: 10 }],
  ['ellipse', { cx: 84, cy: 275, rx: 8.5, ry: 9 }], ['ellipse', { cx: 116, cy: 275, rx: 8.5, ry: 9 }],
  ['ellipse', { cx: 84, cy: 360, rx: 8, ry: 7 }], ['ellipse', { cx: 116, cy: 360, rx: 8, ry: 7 }],
];
const FRONT_DECOR = 'M90,128 L110,128 M90,144 L110,144 M90,160 L110,160 M100,114 L100,174';

const BACK = [
  ['trapecio', 'M100,46 C96,54 88,62 70,68 C78,74 88,84 96,100 C98,108 99.5,116 99.5,120 Z'],
  ['deltoide_post', 'M68,70 C60,70 52,78 50,92 C50,96 51,100 52,103 C58,98 64,90 70,82 C72,78 72,74 68,70 Z'],
  ['espalda_media', 'M72,84 C80,88 88,96 92,106 C88,112 82,114 76,112 C72,104 71,94 72,84 Z'],
  ['dorsales', 'M70,114 C78,116 88,114 94,110 C97,120 99,130 99.5,138 L99.5,150 C92,154 84,156 78,156 C74,146 70,132 68,118 Z'],
  ['triceps', 'M52,106 C58,102 64,102 67,106 C69,118 67,130 63,140 C57,142 52,141 49,138 C47,126 48,114 52,106 Z'],
  ['antebrazo', 'M48,142 C54,145 60,145 63,143 C63,156 59,170 55,184 L47,184 C44,170 44,155 48,142 Z'],
  ['lumbar', 'M86,154 C92,155 97,155 99.5,155 L99.5,180 C95,181 90,180 87,178 C86,170 86,162 86,154 Z'],
  ['abductores', 'M74,160 C80,158 86,160 86,166 C82,170 78,176 76,182 C73,176 72,168 74,160 Z'],
  ['gluteos', 'M76,186 C82,178 92,178 99.5,182 L99.5,214 C92,222 82,222 76,214 C72,206 72,194 76,186 Z'],
  ['isquios', 'M75,222 C82,226 92,226 98,222 C97,240 95,256 91,268 C85,272 79,270 77,266 C73,252 72,236 75,222 Z'],
  ['pantorrillas', 'M76,284 C82,280 90,282 92,288 C94,302 91,318 87,332 C82,334 77,330 76,324 C73,310 72,296 76,284 Z'],
];
const BACK_BASE = [
  ['ellipse', { cx: 100, cy: 28, rx: 15, ry: 19 }],
  ['path', { d: 'M92,42 L108,42 L111,62 L89,62 Z' }],
  ['path', { d: 'M70,66 C84,62 116,62 130,66 L134,100 C130,124 127,146 125,160 L128,196 L72,196 L75,160 C73,146 70,124 66,100 Z' }],
  ['ellipse', { cx: 51, cy: 194, rx: 6, ry: 10 }], ['ellipse', { cx: 149, cy: 194, rx: 6, ry: 10 }],
  ['ellipse', { cx: 84, cy: 276, rx: 8.5, ry: 9 }], ['ellipse', { cx: 116, cy: 276, rx: 8.5, ry: 9 }],
  ['path', { d: 'M81,330 L89,330 L88,354 L82,354 Z' }], ['path', { d: 'M119,330 L111,330 L112,354 L118,354 Z' }],
  ['ellipse', { cx: 85, cy: 362, rx: 8, ry: 6 }], ['ellipse', { cx: 115, cy: 362, rx: 8, ry: 6 }],
];
const BACK_DECOR = 'M100,120 L100,180';

export const FRONT_IDS = new Set(FRONT.map(([id]) => id));
export const BACK_IDS = new Set(BACK.map(([id]) => id));

function baseShapes(list) {
  return list.map(([tag, a]) => (tag === 'ellipse'
    ? html`<ellipse cx=${a.cx} cy=${a.cy} rx=${a.rx} ry=${a.ry} fill="var(--body)" />`
    : html`<path d=${a.d} fill="var(--body)" />`));
}

function Figure({ shapes, base, decor, fills, selected, onSelect, label, interactive }) {
  const fillOf = (id) => fills?.[id] || 'var(--heat-0)';
  const one = (id, d, mirrored) => html`
    <path class=${'m' + (selected === id ? ' sel' : '')} d=${d} fill=${fillOf(id)}
      transform=${mirrored ? MIRROR : undefined}
      onClick=${interactive ? () => onSelect?.(id) : undefined}>
      ${interactive ? html`<title>${label?.(id) ?? id}</title>` : null}
    </path>`;
  return html`
    <svg viewBox="0 0 ${W} 376" role="img" aria-label="Figura muscular">
      <g>${baseShapes(base)}</g>
      <g fill="none" stroke="var(--body)" stroke-width="5" stroke-linejoin="round">
        ${shapes.map(([, d]) => html`<path d=${d} /><path d=${d} transform=${MIRROR} />`)}
      </g>
      <g>${shapes.map(([id, d]) => [one(id, d, false), one(id, d, true)])}</g>
      <path d=${decor} stroke="var(--surface)" stroke-width="1.2" fill="none" opacity=".7" pointer-events="none" />
    </svg>`;
}

export function Anatomy({ fills, selected, onSelect, label }) {
  return html`
    <div class="anat">
      <figure>
        <${Figure} shapes=${FRONT} base=${FRONT_BASE} decor=${FRONT_DECOR} fills=${fills} selected=${selected} onSelect=${onSelect} label=${label} interactive />
        <figcaption>Frente</figcaption>
      </figure>
      <figure>
        <${Figure} shapes=${BACK} base=${BACK_BASE} decor=${BACK_DECOR} fills=${fills} selected=${selected} onSelect=${onSelect} label=${label} interactive />
        <figcaption>Espalda</figcaption>
      </figure>
    </div>`;
}

// Figura pequeña para ejercicios sin dibujo: músculo principal en rojo, secundarios en tono suave.
export function MiniBody({ primary = [], secondary = [] }) {
  const fills = {};
  for (const m of secondary) fills[m] = 'var(--heat-2)';
  for (const m of primary) fills[m] = 'var(--accent)';
  const backScore = primary.filter((m) => BACK_IDS.has(m) && !FRONT_IDS.has(m)).length;
  const frontScore = primary.filter((m) => FRONT_IDS.has(m) && !BACK_IDS.has(m)).length;
  const back = backScore > frontScore;
  return html`<${Figure} shapes=${back ? BACK : FRONT} base=${back ? BACK_BASE : FRONT_BASE} decor=${back ? BACK_DECOR : FRONT_DECOR} fills=${fills} />`;
}
