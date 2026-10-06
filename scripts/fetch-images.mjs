// Descarga los dibujos de Higgsfield listados en seed/images.json a app/img/ex/<id>.png.
// Uso: node scripts/fetch-images.mjs   (requiere acceso a d8j0ntlcm91z4.cloudfront.net)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const map = JSON.parse(readFileSync(new URL('seed/images.json', root)));
mkdirSync(new URL('app/img/ex/', root), { recursive: true });
let ok = 0; let fail = 0;
for (const [id, url] of Object.entries(map)) {
  if (id.startsWith('_')) continue;
  const out = new URL(`app/img/ex/${id}.png`, root);
  if (existsSync(out)) { ok++; continue; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    ok++;
  } catch (e) { fail++; console.error(`${id}: ${e.message}`); }
}
console.log(`${ok} listos, ${fail} con error`);
