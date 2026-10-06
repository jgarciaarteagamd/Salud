// Genera el prompt de Higgsfield con la plantilla fija de estilo para un ejercicio del catálogo.
// Uso: node scripts/prompt.mjs <id> [<id> ...]
import { readFileSync } from 'node:fs';
const catalog = [...JSON.parse(readFileSync(new URL('../seed/exercises.json', import.meta.url))), ...JSON.parse(readFileSync(new URL('../seed/freeletics.json', import.meta.url)))];
export const stylePrompt = (e) =>
  `Flat minimalist instructional fitness illustration, part of a consistent exercise icon series. One athletic adult figure drawn as a smooth, faceless, uniform slate-gray (#3A4550) mannequin with clean geometric shapes and no clothing details, performing: ${e.prompt}. The working muscles (${e.highlight}) are highlighted in solid coral red (#E5533D). Equipment drawn in light cool-gray (#B8C2CC) with thin dark outlines. ${e.view}, full body and equipment visible, centered with generous margin. Plain flat background color #EEF2F4, a soft subtle floor ellipse shadow. No text, no letters, no labels, no logos, no arrows, no gradients, no realistic texture.`;
const ids = process.argv.slice(2);
for (const id of ids) {
  const i = catalog.findIndex((e) => e.id === id);
  if (i < 0) { console.error('no existe', id); continue; }
  console.log(JSON.stringify({ index: i, params: { model: 'gpt_image_2_5', aspect_ratio: '1:1', prompt: stylePrompt(catalog[i]) } }));
}
