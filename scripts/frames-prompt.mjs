// Peticiones de Higgsfield para las posiciones inicial (a) y final (b) de cada ejercicio,
// usando su dibujo original como referencia. Uso: node scripts/frames-prompt.mjs [id...]
import { readFileSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const frames = JSON.parse(readFileSync(new URL('seed/frames.json', root)));
const images = JSON.parse(readFileSync(new URL('seed/images.json', root)));
const jobOf = (url) => url.match(/_([0-9a-f-]{36})\.png$/)[1];
export const framePrompt = (pose, phase) => `Redraw this exact illustration keeping everything identical: same flat style, same slate-gray faceless mannequin, same equipment, same camera angle, same framing and scale, same coral red muscle highlights, same plain background. Change ONLY the body pose to the ${phase} position of the movement: ${pose}. No text, no arrows.`;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(frames);
const out = [];
for (const id of ids) {
  const [a, b] = frames[id];
  const ref = [{ value: jobOf(images[id]), role: 'image_references' }];
  out.push({ key: `${id}-a`, params: { model: 'gpt_image_2_5', aspect_ratio: '1:1', medias: ref, prompt: framePrompt(a, 'START') } });
  out.push({ key: `${id}-b`, params: { model: 'gpt_image_2_5', aspect_ratio: '1:1', medias: ref, prompt: framePrompt(b, 'END') } });
}
console.log(JSON.stringify(out));
