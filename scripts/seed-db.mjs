// Convierte seed/exercises.json en las operaciones para cargar el catálogo en el db del artifact
// (colección `exercises`). Lo usa Claude con la herramienta ArtifactData después de publicar.
import { readFileSync } from 'node:fs';
const ex = JSON.parse(readFileSync(new URL('../seed/exercises.json', import.meta.url)));
const now = new Date().toISOString();
const ops = ex.map(({ id, prompt, highlight, view, ...rest }) => ({
  op: 'set', collection: 'exercises', doc_id: id,
  data: { ...rest, prompt, image: `img/ex/${id}.png`, createdAt: now },
}));
console.log(JSON.stringify(ops, null, 0));
