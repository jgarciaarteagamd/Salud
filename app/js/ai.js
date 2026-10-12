// Todo lo que se le pide a Claude desde la app. Cada llamada es independiente: el contexto
// (perfil, historial, medidas) se arma aquí y viaja completo en el prompt.
import { MUSCLES, muscleName, rangesFor } from './muscles.js';
import {
  MEASURE_FIELDS, NUTRITION_FIELDS, WEEKLY_FIELDS, MEASURE_TYPES, mergeMeasurementsByDate, SOURCE_SHORT,
  ACTIVITY_TYPES, ACTIVITY_FIELDS, isWeekly, paceLabel, MICRO_FIELDS, LIMIT_FIELDS, NUTRITION_FIELD, metaOf,
} from './fields.js';
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

function measurementsBlock(measurements, limit = 4) {
  const days = mergeMeasurementsByDate(measurements).reverse().slice(0, limit);
  if (!days.length) return 'Sin medidas registradas.';
  return days.map((d) => {
    const vals = MEASURE_FIELDS.filter((f) => d.valores[f.key] != null).map((f) => `${f.label} ${d.valores[f.key]}${f.unit ? ` ${f.unit}` : ''} [${SOURCE_SHORT[d.fuente[f.key]] || d.fuente[f.key]}]`).join(', ');
    return `${d.date}: ${vals}`;
  }).join('\n') + '\n(Grasa y músculo: el reloj es la referencia; la báscula no es comparable.)';
}

function nutritionBlock(nutrition) {
  const since = dateKey(addDays(new Date(), -7));
  const recent = nutrition.filter((n) => !isWeekly(n) && n.date >= since);
  const week = weeklyBlock(nutrition, 1);
  if (!recent.length) return 'Sin registros diarios de nutrición en los últimos 7 días.' + (week ? `\n${week}` : '');
  const avg = (k) => { const v = recent.map((n) => num(n.valores?.[k])).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const macroKeys = ['kcal', 'proteina', 'carbohidratos', 'grasa', 'fibra', 'agua', 'kcalObjetivo', 'proteinaObjetivo'];
  const macros = macroKeys.map((k) => { const f = NUTRITION_FIELD[k]; const a = avg(k); return a == null ? null : `${f.label} promedio ${fmtNum(a, 0)} ${f.unit}`; }).filter(Boolean).join(', ');
  const micro = microSummary(recent);
  return macros + ` (${recent.length} de 7 días registrados; los días sin registro no son ayuno, solo no se anotaron)`
    + (micro ? `\n${micro}` : '') + (week ? `\n${week}` : '');
}

// Promedio de cada vitamina, mineral y nutriente a limitar frente a su meta (o máximo) de Fitia.
export function microStats(days) {
  const rows = days.filter((n) => !isWeekly(n));
  const stat = (f, limit) => {
    const vals = rows.filter((n) => num(n.valores?.[f.key]) != null);
    if (!vals.length) return null;
    const pct = vals.map((n) => num(n.valores[f.key]) / (metaOf(n, f.key) || 1));
    const avg = vals.reduce((a, n) => a + num(n.valores[f.key]), 0) / vals.length;
    const avgPct = pct.reduce((a, b) => a + b, 0) / pct.length;
    const off = limit ? pct.filter((p) => p > 1).length : pct.filter((p) => p < 0.7).length;
    return { key: f.key, label: f.label, unit: f.unit, avg, meta: metaOf(vals[vals.length - 1], f.key), pct: avgPct, off, n: vals.length, limit };
  };
  return {
    micro: [NUTRITION_FIELD.fibra, ...MICRO_FIELDS].map((f) => stat(f, false)).filter(Boolean),
    limit: LIMIT_FIELDS.map((f) => stat(f, true)).filter(Boolean),
  };
}

function microSummary(days) {
  const { micro, limit } = microStats(days);
  if (!micro.length && !limit.length) return '';
  const fmt = (x) => `${x.label} ${fmtNum(x.avg, x.avg < 10 ? 1 : 0)} ${x.unit} (${fmtNum(x.pct * 100, 0)} % de ${x.limit ? 'su máximo' : 'la meta'}; ${x.off} de ${x.n} días ${x.limit ? 'por encima' : 'bajo el 70 %'})`;
  const low = micro.filter((x) => x.pct < 0.9).sort((a, b) => a.pct - b.pct);
  const ok = micro.filter((x) => x.pct >= 0.9);
  return [
    low.length ? `Vitaminas, minerales y fibra por debajo de la meta: ${low.map(fmt).join('; ')}` : '',
    ok.length ? `Cubiertos (≥90 %): ${ok.map((x) => `${x.label} ${fmtNum(x.pct * 100, 0)} %`).join(', ')}` : '',
    limit.length ? `A limitar: ${limit.map(fmt).join('; ')}` : '',
  ].filter(Boolean).join('\n');
}

function weeklyBlock(nutrition, limit = 4) {
  const weeks = nutrition.filter(isWeekly).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
  return weeks.map((w) => {
    const vals = WEEKLY_FIELDS.filter((f) => w.valores?.[f.key] != null).map((f) => `${f.label} ${w.valores[f.key]}${f.unit ? ` ${f.unit}` : ''}`).join(', ');
    return `Score nutricional semanal de Fitia ${w.date}${w.dateEnd ? ` a ${w.dateEnd}` : ''}: ${vals}${w.notas ? ` · ${w.notas}` : ''}`;
  }).join('\n');
}

// Tabla compacta de días de Fitia, para el chat.
function nutritionDays(nutrition, days = 45) {
  const since = dateKey(addDays(new Date(), -days));
  const rows = nutrition.filter((n) => !isWeekly(n) && n.date >= since).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!rows.length) return 'Sin registros diarios.';
  const v = (n, k) => (n.valores?.[k] == null ? '-' : n.valores[k]);
  const micros = (n) => MICRO_FIELDS.filter((f) => n.valores?.[f.key] != null).map((f) => `${f.key} ${n.valores[f.key]}`).join(' ');
  const metas = MICRO_FIELDS.map((f) => `${f.key} ${f.meta} ${f.unit}`).join(', ');
  return `Metas diarias de referencia de Fitia: ${metas}. Fibra 38 g. Máximos: grasa sat ~10 % de las kcal, azúcar añadido 25 g, sal ~5 g.\n`
    + 'fecha | kcal/meta | proteína/meta g | carbos/meta g | grasa/meta g | fibra g | grasa sat g | azúcar añadido g | sal g | calidad Fitia | vitaminas y minerales\n'
    + rows.map((n) => `${n.date} | ${v(n, 'kcal')}/${v(n, 'kcalObjetivo')} | ${v(n, 'proteina')}/${v(n, 'proteinaObjetivo')} | ${v(n, 'carbohidratos')}/${v(n, 'carbObjetivo')} | ${v(n, 'grasa')}/${v(n, 'grasaObjetivo')} | ${v(n, 'fibra')} | ${v(n, 'grasaSat')} | ${v(n, 'azucar')} | ${v(n, 'sal')} | ${n.calidad || '-'} | ${micros(n) || '-'}${n.valores?.alcohol ? ` | alcohol ${n.valores.alcohol} g` : ''}${n.notas && !n.notas.startsWith('Importado') ? ` | nota: ${n.notas}` : ''}`).join('\n')
    + `\n\nRESUMEN DE MICRONUTRIENTES (${rows.length} días)\n${microSummary(rows)}`;
}

export function activityLine(a) {
  const v = a.valores || {};
  const parts = ACTIVITY_FIELDS.filter((f) => v[f.key] != null).map((f) => `${f.label} ${fmtNum(Number(v[f.key]), 1)}${f.unit ? ` ${f.unit}` : ''}`);
  const pace = paceLabel(a); if (pace) parts.push(`ritmo ${pace}`);
  const largos = (a.largos || []).length ? `\n    largos: ${a.largos.map((l) => `${l.n}) ${l.tiempo}${l.descanso ? ` (descanso ${l.descanso})` : ''}`).join(', ')}` : '';
  return `${a.date}${a.hora ? ` ${a.hora}` : ''} — ${ACTIVITY_TYPES[a.tipo] || a.tipo}${a.lugar ? ` (${a.lugar})` : ''}: ${parts.join(', ')}${a.notas ? ` · nota: ${a.notas}` : ''}${largos}`;
}

function activitiesBlock(activities = [], days = 14) {
  const since = dateKey(addDays(new Date(), -days));
  const list = activities.filter((a) => a.date >= since).sort((a, b) => (a.date < b.date ? 1 : -1));
  return list.length ? list.map(activityLine).join('\n') : `Sin actividades de cardio en los últimos ${days} días.`;
}

export const modalidadOf = (e) => e?.modalidad || 'forus';
export const freeleticsNames = (sessions = []) => [...new Set(sessions.map((s) => s.freeleticsName).filter(Boolean))];

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

export function buildPlanPrompt({ profile, exercises, sessions, measurements, nutrition, activities, checkin }) {
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

CARDIO Y OTRAS ACTIVIDADES (Samsung Health; no cuentan como series de fuerza, pero sí como fatiga)
${activitiesBlock(activities)}

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
- Si en las últimas 24-48 h hubo natación u otro cardio exigente, tenlo en cuenta: la natación carga hombros y dorsales, así que modera el volumen de esos grupos ese día.
- Protege rodilla derecha y espalda: con dolor ≥4/10 evita ejercicios marcados "precaucion" para esa zona o reduce rango y carga; nunca uses "evitar". Explica la precaución concreta.
${fl ? `- Peso corporal: "peso" siempre null. Progresa con más repeticiones, más segundos, tempo más lento o una variante más difícil del catálogo.
- Respeta cómo mide Freeletics cada ejercicio: si el catálogo dice "se mide en segundos", usa "segundos" y deja "reps" en null; si no lo dice, usa "reps" (número entero, p. ej. "10") y deja "segundos" en null. Freeletics no permite cambiar esa medida.
- Esquema de Freeletics: cada serie es una entrada; si es "por lado", la serie se hace izquierda y derecha (las reps o segundos son por lado). Pausa de 10 s entre series y entre lados, y 30 s entre ejercicios. "descansoSeg" es la pausa entre series: 10 s en movilidad y estiramientos; 10-30 s en fuerza.
- Incluye calentamiento de movilidad y cierre con estiramientos cuando quepa en el tiempo.
- Pon en "nombre_freeletics" un nombre corto para guardar el workout en Freeletics (máximo 24 caracteres, sin fecha, en español, que diga el enfoque; p. ej. "Empuje y core 02"). No repitas estos nombres ya usados: ${freeleticsNames(sessions).join(', ') || 'ninguno'}.` : '- Progresión: si la última vez cumplió las repeticiones con RIR ≥2, sube la carga ~2.5-5%; si no, mantenla. Sugiere el peso en kg cuando haya historial; si no lo hay, deja peso en null.'}
- La sesión debe caber en el tiempo disponible contando calentamiento y descansos.
- El calentamiento y la vuelta a la calma también son ejercicios, con la misma forma que los del bloque: cada uno se muestra con su dibujo y su explicación. Elige del catálogo (movilidad, estiramientos, cardio o series ligeras de aproximación de un ejercicio del bloque). Cardio y estiramientos sostenidos van en "segundos" (5 min = 300) con "reps" null; normalmente 1 serie y "descansoSeg" 0. Para series de aproximación pon el peso ligero en "peso".
- Usa ejercicios del catálogo por su id. Solo si hace falta uno que no existe, ponlo en "nuevo" con exerciseId null.
- Escribe en español, breve y directo.

Responde SOLO con un JSON con esta forma exacta:
{"titulo": "Torso — empuje y espalda",${fl ? ' "nombre_freeletics": "Empuje y core 02",' : ''} "enfoque": ["pecho","dorsales"], "razonamiento": "2-4 frases de por qué esta sesión hoy", "calentamiento": [{"exerciseId": "${fl ? 'fl-cat-cow' : 'eliptica'}", "nuevo": null, "series": ${fl ? 2 : 1}, "reps": ${fl ? '"10"' : 'null'}, "segundos": ${fl ? 'null' : 300}, "peso": null, "rir": null, "descansoSeg": ${fl ? 10 : 0}, "nota": "ritmo suave"}], "ejercicios": [{"exerciseId": "press-pecho-maquina", "nuevo": null, "series": 3, "reps": "8-10", "segundos": null, "peso": 40, "rir": 2, "descansoSeg": 90, "nota": "consejo corto"}], "vuelta_calma": [{"exerciseId": "...", "nuevo": null, "series": 1, "reps": null, "segundos": 30, "peso": null, "rir": null, "descansoSeg": 0, "nota": "..."}], "precauciones": ["..."]}
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

export async function extractNutrition(files, { signal, weekly } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const keys = NUTRITION_FIELDS.map((f) => `${f.key} = ${f.label} (${f.unit})`).join('\n');
  const wkeys = WEEKLY_FIELDS.slice(0, 3).map((f) => `${f.key} = ${f.label}`).join('\n');
  const prompt = `Estas imágenes son capturas de la app de nutrición Fitia: un resumen diario o el resumen semanal ("Score nutricional").
Extrae los totales consumidos y, si aparecen, las metas. Claves:
${keys}
Copia también vitaminas y minerales si aparecen. En "metas" pon la meta de cada nutriente que muestre la captura (el número después de la barra, p. ej. "854/900 mcg" → valor 854 y meta 900) y, para los nutrientes a limitar, el máximo ("Máx 23 g" → 23). Usa las mismas claves. En "calidad" copia la calidad de alimentos (Muy bajo, Bajo, Regular, Bueno o Excelente). "azucar" es el azúcar añadido.
Si es el resumen semanal: marca "periodo": "semana", pon en "fecha" el primer día y en "fechaFin" el último día de la semana, usa el promedio diario de la semana en las claves anteriores y agrega estas claves si aparecen:
${wkeys}
En "fortalezas" y "mejoras" copia en frases cortas lo que la app destaca como bien y por mejorar.${weekly ? '\nEl usuario indicó que es el resumen semanal.' : ''}
Usa el año ${new Date().getFullYear()} si la captura no lo muestra. No inventes valores que no se vean.
Responde SOLO con JSON: {"fecha": "AAAA-MM-DD o null", "fechaFin": "AAAA-MM-DD o null", "periodo": "dia|semana", "valores": {"kcal": 2100, "proteina": 150, "vitD": 10}, "metas": {"fibra": 38, "vitD": 15, "grasaSat": 23}, "calidad": "Regular o null", "fortalezas": ["..."], "mejoras": ["..."], "resumen": "1 frase"}`;
  return sample.json(prompt, { images: files, modelTier: 'default', cache: false, signal });
}

export async function extractActivity(files, { signal } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const keys = ACTIVITY_FIELDS.map((f) => `${f.key} = ${f.label} (${f.unit || 'número'})`).join('\n');
  const prompt = `Estas imágenes son capturas de una actividad registrada en Samsung Health (Galaxy Watch) u otra app de reloj: natación, caminata, carrera, bicicleta, etc.
Extrae los datos. Claves de "valores":
${keys}
Convierte la duración a minutos con decimales (46:56 = 46.93). "activoMin" es el tiempo en movimiento si aparece, o calcúlalo con el ritmo medio y la distancia. Distancia en metros.
Si hay una tabla de largos o vueltas (splits), copia cada fila en "largos" con el tiempo y el descanso tal como aparecen.
Usa el año ${new Date().getFullYear()} si la captura no lo muestra. No inventes valores que no se vean.
Responde SOLO con JSON: {"fecha": "AAAA-MM-DD o null", "hora": "HH:MM o null", "tipo": "${Object.keys(ACTIVITY_TYPES).join('|')}", "lugar": "Piscina, Parque… o null", "valores": {"distancia": 550, "duracionMin": 46.93}, "ritmo": "texto del ritmo medio o null", "largos": [{"n": 1, "distancia": 25, "tiempo": "00:52.3", "ritmo": "03'29\\"", "descanso": "00:23.1 o null", "estilo": "Libre"}], "zonasFC": "resumen de las zonas de FC o null", "dispositivo": "Galaxy Watch6 o null", "resumen": "1 frase"}`;
  return sample.json(prompt, { images: files, modelTier: 'default', cache: false, signal });
}

/* ---------- resumen para el proyecto Mi Salud ---------- */
export function miSaludSummary({ profile, sessions, measurements, nutrition, activities = [], days = 14 }) {
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
  lines.push('Cardio y otras actividades:');
  lines.push(activitiesBlock(activities, days));
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

/* ---------- chat con el asistente de fitness y nutrición ---------- */
// Todo lo que hay en la app, en texto. Se arma de nuevo en cada mensaje, así el asistente siempre ve lo último.
export function coachContext(st) {
  const today = todayKey();
  const done = completedSessions(st.sessions || []).filter((s) => s.status === 'guardada');
  const open = (st.sessions || []).filter((s) => s.status === 'plan' || s.status === 'en_curso');
  const R = rangesFor(st.profile);
  const w1 = setsByMuscle(done, dateKey(addDays(new Date(), -6)), today);
  const w4 = setsByMuscle(done, dateKey(addDays(new Date(), -27)), today);
  const lt = lastTrained(done);
  const volume = MUSCLES.map((m) => `${m.name}: ${fmtNum(w1[m.id])} series en 7 días, ${fmtNum((w4[m.id] || 0) / 4)} por semana en 4 semanas, meta ${R[m.id].max ? `${R[m.id].min}-${R[m.id].max}` : 'sin trabajo dedicado'}, último ${lt[m.id] || 'nunca'}`).join('\n');
  const prs = recentPRs(done, 8).map((p) => `${p.date} ${p.name}: ${fmtSet(p.set || {})} kg, 1RM estimado ${fmtNum(p.e1rm)} kg (+${fmtNum(p.gain * 100, 0)} %)`).join('\n');
  const catalog = (st.exercises || []).filter((e) => !e.archived).map((e) => `${e.name}${e.nombreEs ? ` (${e.nombreEs})` : ''} [${modalidadOf(e) === 'freeletics' ? 'Freeletics' : 'Forus'}] ${(e.primary || []).join(',')}${e.knee && e.knee !== 'ok' ? ` rodilla:${e.knee}` : ''}${e.back && e.back !== 'ok' ? ` espalda:${e.back}` : ''}`).join('\n');
  return `HOY ES ${today} (${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date().getDay()]}).

PERFIL
${profileBlock(st.profile || {})}

VOLUMEN POR MÚSCULO (series efectivas; los músculos secundarios cuentan 0.5)
${volume}

SESIONES DE FUERZA GUARDADAS (más reciente primero; ${done.length} en total)
${done.slice(0, 30).map(sessionLine).join('\n\n') || 'Aún no hay sesiones guardadas.'}
${open.length ? `\nSESIÓN EN CURSO O PLANIFICADA\n${open.map(sessionLine).join('\n\n')}` : ''}

RÉCORDS RECIENTES
${prs || 'Sin récords todavía.'}

CARDIO Y OTRAS ACTIVIDADES (últimos 60 días)
${activitiesBlock(st.activities || [], 60)}

MEDIDAS CORPORALES (por fecha; entre corchetes la fuente)
${measurementsBlock(st.measurements || [], 12)}

NUTRICIÓN DIARIA (Fitia, últimos 45 días; las fechas que faltan no se registraron)
${nutritionDays(st.nutrition || [])}

${weeklyBlock(st.nutrition || []) || 'Sin resúmenes semanales de Fitia.'}

CATÁLOGO DE EJERCICIOS
${catalog}`;
}

const COACH_RULES = `Eres el asistente de Fitness Log: un entrenador personal y nutricionista deportivo con experiencia, que acompaña a esta persona. Tienes delante todos los datos de su app (abajo). Úsalos: cita fechas, cifras y ejercicios concretos cuando respondas.
Cómo respondes:
- En español, cercano y directo. Primero la respuesta, después el porqué. Normalmente 80-200 palabras; más solo si lo pide.
- Su objetivo es la recomposición corporal (ganar músculo sin subir de peso). Es principiante y entrena unas 2 veces por semana 1 hora en Forus, más Freeletics en casa y algo de cardio como natación.
- Cuida su rodilla derecha y su espalda en cada recomendación.
- Los días sin registro en Fitia significan que no se anotó, no que no comió.
- Para vitaminas y minerales mira la tendencia de varios días, no un día suelto. Prioriza comida real (qué alimentos concretos los aportan) antes que suplementos; si un déficit es persistente (por ejemplo vitamina D), sugiere comentarlo con su médico para valorar análisis o suplemento.
- Distingue lo que muestran los datos de lo que supones. Si falta un dato, dilo y sugiere cómo registrarlo en la app.
- No diagnostiques. Ante dolor fuerte, que no cede o con síntomas nuevos, recomienda consultar a su médico o fisioterapeuta.
- Formato: párrafos cortos y listas con "- ". Usa **negrita** solo para lo clave. Sin tablas ni encabezados grandes.

DATOS DE LA APP
`;

// turns: [{role, content}] terminando en el mensaje nuevo del usuario.
export async function askCoach(st, turns, { signal, onText, images } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const recent = turns.slice(-20);
  while (recent.length && recent[0].role !== 'user') recent.shift();
  const input = recent.map((t, i) => (i === 0 ? { role: 'user', content: `${COACH_RULES}${coachContext(st)}\n\n---\nMENSAJE DEL USUARIO:\n${t.content}` } : { role: t.role, content: t.content }));
  const opts = { modelTier: 'default', cache: false, signal, onText };
  if (images?.length) opts.images = images;
  return sample(input, opts);
}
