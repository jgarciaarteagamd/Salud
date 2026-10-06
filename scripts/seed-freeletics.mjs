// Operaciones para cargar el catálogo de Freeletics (seed/freeletics.json) en el db del artifact.
// Imagen: app/img/ex/<id>.png si existe; si no, reutiliza la indicada en REUSE.
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const fl = JSON.parse(readFileSync(new URL('seed/freeletics.json', root)));
const REUSE = { 'fl-dead-bug': 'dead-bug', 'fl-plank-hold': 'plancha', 'fl-calf-raises': 'pantorrillas', 'fl-quad-stretch': 'estiramientos', 'fl-arm-leg-lifts': 'bird-dog' };
const now = new Date().toISOString();
const img = (id) => (existsSync(new URL(`app/img/ex/${id}.png`, root)) ? id : null);
const ops = fl.map(({ id, highlight, view, ...rest }) => {
  const base = img(id) || REUSE[id];
  const data = { ...rest, createdAt: now };
  if (base) data.image = `img/ex/${base}.png`;
  if (base && img(`${base}-a`) && img(`${base}-b`)) data.frames = [`img/ex/${base}-a.png`, `img/ex/${base}-b.png`];
  return { op: 'set', collection: 'exercises', doc_id: id, data };
});
console.log(JSON.stringify(ops));
