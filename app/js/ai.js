// Todo lo que se le pide a Claude desde la app. Cada llamada es independiente: el contexto
// (perfil, historial, medidas) se arma aquí y viaja completo en el prompt.
import { MUSCLES, muscleName, rangesFor } from './muscles.js';
import { MEASURE_FIELDS, NUTRITION_FIELDS, MEASURE_TYPES } from './fields.js';
import {
  completedSessions, setsByMuscle, todayKey, dateKey, addDays, lastTrained, lastPerformance,
  activeItems, isWorkSet, fmtNum, num,
} from './stats.js';

let samplePromise = null;
export function getSample() {
  if (!samplePromise) samplePromise = (async () => { try { return window.claude ? await window.claude.use('sample') : null; } catch { return null; } })();
  return samplePromise;
}
export async function imageLimits() {
  const s = await getSample();
  if (!s) return null;
  try { return (await s.limits())?.images || null; } catch { return null; }
}

export function errorCopy(e) {
  switch (e?.code) {
    case 'not_granted': return 'No diste permiso para usar Claude en esta página. Puedes activarlo en los permisos del artifact.';
    case 'sampling_disabled': return 'Claude no está disponible para esta cuenta.';
    case 'rate_limited': return 'Llegaste al límite de uso por ahora. Intenta en unos minutos.';
    case 'session_expired': return 'Tu sesión expiró. Vuelve a iniciar sesión en claude.ai.';
    case 'image_rejected': return 'La imagen no se pudo leer. Prueba con otra captura (JPG o PNG).';
    case 'images_unavailable': return 'Esta vista no puede enviar imágenes a Claude. Llena los valores a mano.';
    case 'invalid_json': return 'La respuesta llegó incompleta. Toca “Intentar de nuevo”.';
    case 'refused': return 'Claude no pudo responder a esta solicitud. Ajusta las notas e intenta otra vez.';
    case 'prompt_too_large': return 'Hay demasiado historial para enviar. Avísame y lo resumimos.';
    case 'cancelled': return '';
    default: return 'No se pudo conectar con Claude. Intenta de nuevo.';
  }
}

/* ---------- contexto ---------- */
function profileBlock(p = {}) {
  const lines = [];
  if (p.nombre) lines.push(`Nombre: ${p.nombre}`);
  const datos = [p.edad && `${p.edad} años`, p.sexo, p.estatura && `${p.estatura} cm`].filter(Boolean).join(', ');
  if (datos) lines.push(`Datos: ${datos}`);
  if (p.objetivo) lines.push(`Objetivo: ${p.objetivo}`);
  lines.push(`Antecedentes y lesiones: ${p.antecedentes || 'Molestias/antecedente de rodilla derecha y de espalda (detalle no registrado).'}`);
  if (p.diasSemana) lines.push(`Frecuencia habitual: ${p.diasSemana} días por semana`);
  if (p.duracionMin) lines.push(`Duración habitual: ${p.duracionMin} min`);
  lines.push(`Gimnasio: ${p.gimnasio || 'Forus'}${p.equipamiento ? ` (${p.equipamiento})` : ''}`);
  if (p.preferencias) lines.push(`Preferencias: ${p.preferencias}`);
  if (p.contextoMiSalud) lines.push(`\nContexto del proyecto Mi Salud (pegado por el usuario):\n${p.contextoMiSalud.slice(0, 6000)}`);
  return lines.join('\n');
}

function sessionLine(s) {
  const parts = [];
  for (const it of s.items || []) {
    if (it.status === 'omitido') { parts.push(`  - OMITIDO ${it.name}${it.reason ? ` (motivo: ${it.reason})` : ''}`); continue; }
    const sets = (it.sets || []).filter(isWorkSet).map((x) => `${num(x.reps)}x${num(x.weight) ?? 0}kg${x.rir !== '' && x.rir != null ? ` RIR${x.rir}` : ''}`).join(', ');
    let tag = '';
    if (it.status === 'sustituido') tag = ` [SUSTITUYÓ a ${it.replacedFrom?.name || '?'}${it.reason ? `; motivo: ${it.reason}` : ''}]`;
    if (it.origin === 'agregado') tag += ' [AGREGADO por el usuario]';
    parts.push(`  - ${it.name}${tag}: ${sets || 'sin series registradas'}${it.note ? ` · nota: ${it.note}` : ''}`);
  }
  const post = s.post ? ` · post: RPE ${s.post.rpe ?? '?'}, dolor rodilla ${s.post.dolorRodilla ?? '?'}/10, espalda ${s.post.dolorEspalda ?? '?'}/10${s.post.notas ? `, "${s.post.notas}"` : ''}` : '';
  return `${s.date} — ${s.title || 'Sesión'}${post}\n${parts.join('\n')}`;
}

function measurementsBlock(measurements) {
  const sorted = [...measurements].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4);
  if (!sorted.length) return 'Sin medidas registradas.';
  return sorted.map((m) => {
    const vals = MEASURE_FIELDS.filter((f) => m.valores?.[f.key] != null).map((f) => `${f.label} ${m.valores[f.key]}${f.unit ? ` ${f.unit}` : ''}`).join(', ');
    return `${m.date} (${MEASURE_TYPES[m.tipo] || m.tipo}): ${vals}`;
  }).join('\n');
}

function nutritionBlock(nutrition) {
  const since = dateKey(addDays(new Date(), -7));
  const recent = nutrition.filter((n) => n.date >= since);
  if (!recent.length) return 'Sin registros de nutrición en los últimos 7 días.';
  const avg = (k) => { const v = recent.map((n) => num(n.valores?.[k])).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return NUTRITION_FIELDS.map((f) => { const a = avg(f.key); return a == null ? null : `${f.label} promedio ${fmtNum(a, 0)} ${f.unit}`; }).filter(Boolean).join(', ') + ` (${recent.length} días registrados)`;
}

function catalogBlock(exercises, sessions) {
  const today = todayKey();
  return exercises.filter((e) => !e.archived).map((e) => {
    const lp = lastPerformance(sessions, e.id, today);
    const last = lp ? ` · última vez ${lp.date}: ${lp.sets.map((x) => `${num(x.reps)}x${num(x.weight) ?? 0}kg`).join(', ')}` : '';
    return `${e.id} | ${e.name} | principal: ${(e.primary || []).join(',')} | secundario: ${(e.secondary || []).join(',')} | rodilla: ${e.knee || 'ok'} | espalda: ${e.back || 'ok'}${last}`;
  }).join('\n');
}

export function buildPlanPrompt({ profile, exercises, sessions, measurements, nutrition, checkin }) {
  const done = completedSessions(sessions).filter((s) => s.date !== todayKey() || s.status === 'guardada');
  const today = todayKey();
  const w1 = setsByMuscle(done, dateKey(addDays(new Date(), -6)), today);
  const w2 = setsByMuscle(done, dateKey(addDays(new Date(), -13)), dateKey(addDays(new Date(), -7)));
  const lt = lastTrained(done);
  const R = rangesFor(profile);
  const volume = MUSCLES.map((x) => { const m = R[x.id]; return `${m.id} (${m.name}): ${fmtNum(w1[m.id])} series últimos 7 días, ${fmtNum(w2[m.id])} la semana previa, ${m.max ? `meta ${m.min}-${m.max}/semana` : 'sin trabajo dedicado'}, último entrenamiento ${lt[m.id] || 'nunca'}`; }).join('\n');
  const history = done.slice(0, 10).map(sessionLine).join('\n\n') || 'Aún no hay sesiones registradas.';

  return `Eres el entrenador personal de esta persona. Diseña la sesión de gimnasio de HOY (${today}) en el gimnasio Forus.

PERFIL
${profileBlock(profile)}

CÓMO LLEGA HOY
- Tiempo disponible: ${checkin.tiempo} minutos
- Energía: ${checkin.energia}/5
- Dolor rodilla derecha: ${checkin.dolorRodilla}/10
- Dolor espalda: ${checkin.dolorEspalda}/10
- Enfoque que prefiere: ${checkin.enfoque || 'que tú decidas según el historial'}
- Notas: ${checkin.notas || 'ninguna'}

VOLUMEN POR MÚSCULO
${volume}

HISTORIAL RECIENTE (más reciente primero)
Los ejercicios OMITIDOS, SUSTITUIDOS o AGREGADOS muestran lo que pasó realmente en el gimnasio: máquinas ocupadas, falta de tiempo, molestias o tiempo extra. Úsalo para ajustar: si una máquina suele estar ocupada, ofrece la alternativa; si se omite por tiempo, ajusta el volumen; si hubo dolor, baja la carga o cambia el ejercicio.
${history}

MEDIDAS CORPORALES RECIENTES
${measurementsBlock(measurements)}

NUTRICIÓN (Fitia)
${nutritionBlock(nutrition)}

CATÁLOGO DE EJERCICIOS (id | nombre | músculos | aptitud rodilla/espalda | última vez)
${catalogBlock(exercises, done)}

REGLAS
- Prioriza los músculos por debajo de su rango semanal y los que llevan más días sin trabajarse; evita repetir un grupo trabajado fuerte hace menos de 48 h.
- Protege rodilla derecha y espalda: con dolor ≥4/10 evita ejercicios marcados "precaucion" para esa zona o reduce rango y carga; nunca uses "evitar". Explica la precaución concreta.
- Progresión: si la última vez cumplió las repeticiones con RIR ≥2, sube la carga ~2.5-5%; si no, mantenla. Sugiere el peso en kg cuando haya historial; si no lo hay, deja peso en null.
- La sesión debe caber en el tiempo disponible contando calentamiento y descansos.
- Usa ejercicios del catálogo por su id. Solo si hace falta uno que no existe, ponlo en "nuevo" con exerciseId null.
- Escribe en español, breve y directo.

Responde SOLO con un JSON con esta forma exacta:
{"titulo": "Torso — empuje y espalda", "enfoque": ["pecho","dorsales"], "razonamiento": "2-4 frases de por qué esta sesión hoy", "calentamiento": ["5 min bicicleta", "..."], "ejercicios": [{"exerciseId": "press-pecho-maquina", "nuevo": null, "series": 3, "reps": "8-10", "peso": 40, "rir": 2, "descansoSeg": 90, "nota": "consejo corto"}], "vuelta_calma": ["..."], "precauciones": ["..."]}
Para un ejercicio nuevo: "exerciseId": null, "nuevo": {"name": "...", "primary": ["id_musculo"], "secondary": [], "equipment": "...", "knee": "ok|precaucion|evitar", "back": "ok|precaucion|evitar"}. Ids de músculo válidos: ${MUSCLES.map((m) => m.id).join(', ')}.`;
}

export async function planSession(ctx, { signal, onText } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const prompt = buildPlanPrompt(ctx);
  return sample.json(prompt, { modelTier: 'complex', cache: false, signal, onText });
}

/* ---------- lectura de capturas ---------- */
export async function extractMeasurements(files, hint, { signal } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const keys = MEASURE_FIELDS.map((f) => `${f.key} = ${f.label} (${f.unit || 'sin unidad'})`).join('\n');
  const prompt = `Estas imágenes son capturas de un informe de medidas corporales (${hint || 'antropometría, báscula de bioimpedancia o Samsung Health/Samsung Watch'}).
Extrae los valores numéricos que aparezcan. Usa estas claves cuando el dato corresponda:
${keys}
Convierte a las unidades indicadas (lb→kg, in→cm). No inventes valores que no se vean.
Responde SOLO con JSON: {"fecha": "AAAA-MM-DD o null", "tipo": "antropometria|bioimpedancia|reloj", "valores": {"peso": 78.4}, "otros": [{"nombre": "...", "valor": 1.2, "unidad": "..."}], "resumen": "1 frase de lo más relevante"}`;
  return sample.json(prompt, { images: files, modelTier: 'default', cache: false, signal });
}

export async function extractNutrition(files, { signal } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const keys = NUTRITION_FIELDS.map((f) => `${f.key} = ${f.label} (${f.unit})`).join('\n');
  const prompt = `Estas imágenes son capturas de la app de nutrición Fitia (resumen diario o semanal).
Extrae los totales consumidos y, si aparecen, las metas. Claves:
${keys}
Si la captura es semanal, devuelve el promedio diario y marca "periodo": "semana".
Responde SOLO con JSON: {"fecha": "AAAA-MM-DD o null", "periodo": "dia|semana", "valores": {"kcal": 2100, "proteina": 150}, "resumen": "1 frase"}`;
  return sample.json(prompt, { images: files, modelTier: 'default', cache: false, signal });
}

/* ---------- resumen para el proyecto Mi Salud ---------- */
export function miSaludSummary({ profile, sessions, measurements, nutrition, days = 14 }) {
  const since = dateKey(addDays(new Date(), -days));
  const done = completedSessions(sessions).filter((s) => s.date >= since);
  const sets = setsByMuscle(done, since, todayKey());
  const lines = [];
  lines.push(`RESUMEN FORUS LOG — ${since} a ${todayKey()}`);
  lines.push(`Sesiones: ${done.length}`);
  lines.push('');
  lines.push('Series por músculo:');
  lines.push(MUSCLES.filter((m) => sets[m.id]).map((m) => `${m.name} ${fmtNum(sets[m.id])}`).join(' · ') || 'sin series');
  lines.push('');
  lines.push('Sesiones:');
  for (const s of done) lines.push(sessionLine(s));
  lines.push('');
  lines.push('Medidas:');
  lines.push(measurementsBlock(measurements));
  lines.push('');
  lines.push('Nutrición 7 días:');
  lines.push(nutritionBlock(nutrition));
  if (profile?.antecedentes) { lines.push(''); lines.push(`Antecedentes: ${profile.antecedentes}`); }
  return lines.join('\n');
}

export { muscleName, activeItems };
