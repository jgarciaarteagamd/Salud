// Todo lo que se le pide a Claude desde la app. Cada llamada es independiente: el contexto
// (perfil, historial, medidas) se arma aquí y viaja completo en el prompt.
import { MUSCLES, muscleName, rangesFor } from './muscles.js';
import { MEASURE_FIELDS, NUTRITION_FIELDS, MEASURE_TYPES, mergeMeasurementsByDate, SOURCE_SHORT } from './fields.js';
import {
  completedSessions, setsByMuscle, todayKey, dateKey, addDays, lastTrained, lastPerformance,
  activeItems, isWorkSet, fmtNum, num, fmtSet, sessionSetCount, sessionVolume, recentPRs,
} from './stats.js';

const FASE_TAG = { calentamiento: ' [CALENTAMIENTO]', enfriamiento: ' [VUELTA A LA CALMA]' };

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
    if (it.status === 'omitido') { parts.push(`  - OMITIDO ${it.name}${FASE_TAG[it.fase] || ''}${it.reason ? ` (motivo: ${it.reason})` : ''}`); continue; }
    const sets = (it.sets || []).filter(isWorkSet).map((x) => `${fmtSet(x)}${num(x.weight) ? 'kg' : ''}${x.rir !== '' && x.rir != null ? ` RIR${x.rir}` : ''}`).join(', ');
    let tag = FASE_TAG[it.fase] || '';
    if (it.status === 'sustituido') tag = ` [SUSTITUYÓ a ${it.replacedFrom?.name || '?'}${it.reason ? `; motivo: ${it.reason}` : ''}]`;
    if (it.origin === 'agregado') tag += ' [AGREGADO por el usuario]';
    parts.push(`  - ${it.name}${tag}: ${sets || 'sin series registradas'}${it.note ? ` · nota: ${it.note}` : ''}`);
  }
  const post = s.post ? ` · post: RPE ${s.post.rpe ?? '?'}, dolor rodilla ${s.post.dolorRodilla ?? '?'}/10, espalda ${s.post.dolorEspalda ?? '?'}/10${s.post.notas ? `, "${s.post.notas}"` : ''}` : '';
  return `${s.date} — ${s.lugar === 'freeletics' ? '[Freeletics en casa] ' : ''}${s.title || 'Sesión'}${post}\n${parts.join('\n')}`;
}

function measurementsBlock(measurements) {
  const days = mergeMeasurementsByDate(measurements).reverse().slice(0, 4);
  if (!days.length) return 'Sin medidas registradas.';
  return days.map((d) => {
    const vals = MEASURE_FIELDS.filter((f) => d.valores[f.key] != null).map((f) => `${f.label} ${d.valores[f.key]}${f.unit ? ` ${f.unit}` : ''} [${SOURCE_SHORT[d.fuente[f.key]] || d.fuente[f.key]}]`).join(', ');
    return `${d.date}: ${vals}`;
  }).join('\n') + '\n(Grasa y músculo: el reloj es la referencia; la báscula no es comparable.)';
}

function nutritionBlock(nutrition) {
  const since = dateKey(addDays(new Date(), -7));
  const recent = nutrition.filter((n) => n.date >= since);
  if (!recent.length) return 'Sin registros de nutrición en los últimos 7 días.';
  const avg = (k) => { const v = recent.map((n) => num(n.valores?.[k])).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return NUTRITION_FIELDS.map((f) => { const a = avg(f.key); return a == null ? null : `${f.label} promedio ${fmtNum(a, 0)} ${f.unit}`; }).filter(Boolean).join(', ') + ` (${recent.length} días registrados)`;
}

export const modalidadOf = (e) => e?.modalidad || 'forus';

// Movilidad, estiramientos y cardio sirven en cualquier lugar para calentar o enfriar:
// además del catálogo del lugar, se ofrecen los de la otra modalidad que sean de ese tipo.
const isWarmupKind = (e) => ['movilidad', 'cardio'].includes(e.categoria);

function catalogBlock(exercises, sessions, lugar, { warmupOnly = false } = {}) {
  const today = todayKey();
  return exercises.filter((e) => !e.archived && (warmupOnly ? modalidadOf(e) !== lugar && isWarmupKind(e) : modalidadOf(e) === lugar)).map((e) => {
    const lp = lastPerformance(sessions, e.id, today, null, warmupOnly);
    const last = lp ? ` · última vez ${lp.date}: ${lp.sets.map(fmtSet).join(', ')}` : '';
    const extra = [e.medida === 'tiempo' && 'se mide en segundos', e.unilateral && 'por lado (I/D)', e.categoria && e.categoria !== 'fuerza' && e.categoria, e.cues && `nota: ${e.cues}`].filter(Boolean).join('; ');
    return `${e.id} | ${e.nombreEs ? `${e.name} (${e.nombreEs})` : e.name} | principal: ${(e.primary || []).join(',')} | secundario: ${(e.secondary || []).join(',')} | rodilla: ${e.knee || 'ok'} | espalda: ${e.back || 'ok'}${extra ? ` | ${extra}` : ''}${last}`;
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
  const lugar = checkin.lugar || 'forus';
  const fl = lugar === 'freeletics';
  const warmCatalog = catalogBlock(exercises, done, lugar, { warmupOnly: true });

  return `Eres el entrenador personal de esta persona. ${fl
    ? `Diseña una sesión de HOY (${today}) en casa, estilo Freeletics: solo peso corporal, sin equipamiento. Complementa sus sesiones de gimnasio en Forus (no las reemplaza).`
    : `Diseña la sesión de gimnasio de HOY (${today}) en el gimnasio Forus.`}

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

CATÁLOGO DE EJERCICIOS ${fl ? 'FREELETICS (peso corporal)' : 'DE FORUS'} (id | nombre | músculos | aptitud rodilla/espalda | detalles | última vez)
${catalogBlock(exercises, done, lugar)}
${warmCatalog ? `
MOVILIDAD, ESTIRAMIENTOS Y CARDIO (sirven en cualquier lugar, para calentar o enfriar)
${warmCatalog}
` : ''}
REGLAS
- Prioriza los músculos por debajo de su rango semanal y los que llevan más días sin trabajarse; evita repetir un grupo trabajado fuerte hace menos de 48 h.
- Protege rodilla derecha y espalda: con dolor ≥4/10 evita ejercicios marcados "precaucion" para esa zona o reduce rango y carga; nunca uses "evitar". Explica la precaución concreta.
${fl ? '- Peso corporal: "peso" siempre null. Progresa con más repeticiones, más segundos, tempo más lento o una variante más difícil del catálogo. Para ejercicios medidos en segundos usa "segundos" y deja "reps" en null. Indica en la nota si es por lado.\n- Incluye calentamiento de movilidad y cierre con estiramientos cuando quepa en el tiempo.' : '- Progresión: si la última vez cumplió las repeticiones con RIR ≥2, sube la carga ~2.5-5%; si no, mantenla. Sugiere el peso en kg cuando haya historial; si no lo hay, deja peso en null.'}
- La sesión debe caber en el tiempo disponible contando calentamiento y descansos.
- El calentamiento y la vuelta a la calma también son ejercicios, con la misma forma que los del bloque: cada uno se muestra con su dibujo y su explicación. Elige del catálogo (movilidad, estiramientos, cardio o series ligeras de aproximación de un ejercicio del bloque). Cardio y estiramientos sostenidos van en "segundos" (5 min = 300) con "reps" null; normalmente 1 serie y "descansoSeg" 0. Para series de aproximación pon el peso ligero en "peso".
- Usa ejercicios del catálogo por su id. Solo si hace falta uno que no existe, ponlo en "nuevo" con exerciseId null.
- Escribe en español, breve y directo.

Responde SOLO con un JSON con esta forma exacta:
{"titulo": "Torso — empuje y espalda", "enfoque": ["pecho","dorsales"], "razonamiento": "2-4 frases de por qué esta sesión hoy", "calentamiento": [{"exerciseId": "${fl ? 'fl-cat-cow' : 'eliptica'}", "nuevo": null, "series": 1, "reps": null, "segundos": ${fl ? 60 : 300}, "peso": null, "rir": null, "descansoSeg": 0, "nota": "ritmo suave"}], "ejercicios": [{"exerciseId": "press-pecho-maquina", "nuevo": null, "series": 3, "reps": "8-10", "segundos": null, "peso": 40, "rir": 2, "descansoSeg": 90, "nota": "consejo corto"}], "vuelta_calma": [{"exerciseId": "...", "nuevo": null, "series": 1, "reps": null, "segundos": 30, "peso": null, "rir": null, "descansoSeg": 0, "nota": "..."}], "precauciones": ["..."]}
Para un ejercicio nuevo: "exerciseId": null, "nuevo": {"name": "...", "primary": ["id_musculo"], "secondary": [], "equipment": "...", "knee": "ok|precaucion|evitar", "back": "ok|precaucion|evitar", "categoria": "fuerza|movilidad|cardio", "medida": "reps|tiempo"}. Ids de músculo válidos: ${MUSCLES.map((m) => m.id).join(', ')}.`;
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
  lines.push(`RESUMEN FITNESS LOG — ${since} a ${todayKey()}`);
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

/* ---------- explicación de un ejercicio ---------- */
export async function exerciseGuide(ex, profile, { signal } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const prompt = `Explica cómo se hace este ejercicio a una persona principiante en el gimnasio.
Ejercicio: ${ex.name}${ex.nombreEs ? ` (${ex.nombreEs})` : ''}
Equipo: ${ex.equipment || 'no indicado'}
Músculos principales: ${(ex.primary || []).join(', ')}; secundarios: ${(ex.secondary || []).join(', ') || 'ninguno'}
${ex.medida === 'tiempo' ? 'Se mide en segundos (isométrico).' : ''}${ex.unilateral ? ' Se hace por lado (izquierda/derecha).' : ''}
Nota del catálogo: ${ex.cues || 'ninguna'}
Antecedentes de la persona: ${profile?.antecedentes || 'antecedente de rodilla derecha y espalda'}

Sé concreto: posición de pies, manos, asiento o apoyo; hacia dónde se mueve la carga o el cuerpo (por ejemplo "empujas el rodillo hacia abajo y atrás"). Español, frases cortas.
Responde SOLO con JSON:
{"resumen": "1 frase de qué es y para qué sirve", "preparacion": ["ajuste de la máquina o posición inicial", "..."], "ejecucion": ["paso 1", "paso 2", "..."], "respiracion": "1 frase", "errores": ["error común y cómo evitarlo", "..."], "cuidados": ["precaución específica para su rodilla derecha o espalda", "..."], "sensacion": "dónde deberías sentirlo", "confusion": "con qué ejercicio se confunde a menudo y cómo distinguirlo, o null"}`;
  return sample.json(prompt, { modelTier: 'default', cache: false, signal });
}

/* ---------- mensaje al terminar la sesión ---------- */
export async function celebrationMessage(session, facts, { signal } = {}) {
  const sample = await getSample();
  if (!sample) return null;
  const prompt = `Escribe un mensaje motivador breve (2-3 frases, español, tono cercano, sin exagerar ni usar emojis) para alguien que acaba de terminar su sesión de ${session.lugar === 'freeletics' ? 'Freeletics en casa' : 'gimnasio en Forus'}. Es principiante (1-2 meses) y su objetivo es ganar músculo sin subir de peso. Menciona 1 o 2 logros concretos de estos datos y una sugerencia para la próxima vez.
Datos: ${JSON.stringify(facts)}`;
  const { text } = await sample(prompt, { modelTier: 'quick', cache: false, signal });
  return text;
}
