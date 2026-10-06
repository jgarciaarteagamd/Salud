// Descarga los dibujos de Higgsfield listados en seed/images.json a app/img/ex/<id>.png.
// Usa curl para respetar el proxy del entorno. Uso: node scripts/fetch-images.mjs
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('..', import.meta.url);
const map = JSON.parse(readFileSync(new URL('seed/images.json', root)));
mkdirSync(new URL('app/img/ex/', root), { recursive: true });
let ok = 0; let fail = 0;
for (const [id, url] of Object.entries(map)) {
  if (id.startsWith('_')) continue;
  const out = new URL(`app/img/ex/${id}.png`, root).pathname;
  if (existsSync(out)) { ok++; continue; }
  try { execFileSync('curl', ['-sSf', '-o', out, url]); ok++; } catch (e) { fail++; console.error(`${id}: ${e.message.split('\n')[0]}`); }
}
console.log(`${ok} listos, ${fail} con error`);
