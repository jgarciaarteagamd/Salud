// Campos de medidas corporales y nutrición. `key` es lo que se guarda en la base de datos.
export const MEASURE_TYPES = {
  antropometria: 'Antropometría',
  bioimpedancia: 'Bioimpedancia (báscula)',
  reloj: 'Samsung Watch',
  manual: 'Registro manual',
};

export const MEASURE_GROUPS = [
  {
    title: 'Composición',
    fields: [
      { key: 'peso', label: 'Peso', unit: 'kg' },
      { key: 'grasaPct', label: 'Grasa corporal', unit: '%' },
      { key: 'masaGrasa', label: 'Masa grasa', unit: 'kg' },
      { key: 'masaMuscular', label: 'Masa muscular', unit: 'kg' },
      { key: 'musculoEsqueletico', label: 'Músculo esquelético', unit: 'kg' },
      { key: 'musculoEsqPct', label: 'Músculo esquelético', unit: '%' },
      { key: 'masaMagra', label: 'Masa libre de grasa', unit: 'kg' },
      { key: 'aguaPct', label: 'Agua corporal', unit: '%' },
      { key: 'aguaKg', label: 'Agua corporal', unit: 'kg' },
      { key: 'grasaSubcutanea', label: 'Grasa subcutánea', unit: '%' },
      { key: 'masaOsea', label: 'Masa ósea', unit: 'kg' },
      { key: 'grasaVisceral', label: 'Grasa visceral', unit: 'nivel' },
      { key: 'imc', label: 'IMC', unit: 'kg/m²' },
      { key: 'tmb', label: 'Metabolismo basal', unit: 'kcal' },
      { key: 'edadMetabolica', label: 'Edad metabólica', unit: 'años' },
      { key: 'proteinaPct', label: 'Proteína', unit: '%' },
    ],
  },
  {
    title: 'Perímetros',
    fields: [
      { key: 'cintura', label: 'Cintura', unit: 'cm' },
      { key: 'cadera', label: 'Cadera', unit: 'cm' },
      { key: 'abdomen', label: 'Abdomen (umbilical)', unit: 'cm' },
      { key: 'pecho', label: 'Pecho', unit: 'cm' },
      { key: 'brazoRelajado', label: 'Brazo relajado', unit: 'cm' },
      { key: 'brazoContraido', label: 'Brazo contraído', unit: 'cm' },
      { key: 'antebrazo', label: 'Antebrazo', unit: 'cm' },
      { key: 'musloMedio', label: 'Muslo medio', unit: 'cm' },
      { key: 'pantorrilla', label: 'Pantorrilla', unit: 'cm' },
      { key: 'cuello', label: 'Cuello', unit: 'cm' },
    ],
  },
  {
    title: 'Pliegues (ISAK)',
    fields: [
      { key: 'plTriceps', label: 'Tríceps', unit: 'mm' },
      { key: 'plSubescapular', label: 'Subescapular', unit: 'mm' },
      { key: 'plBiceps', label: 'Bíceps', unit: 'mm' },
      { key: 'plCrestaIliaca', label: 'Cresta ilíaca', unit: 'mm' },
      { key: 'plSupraespinal', label: 'Supraespinal', unit: 'mm' },
      { key: 'plAbdominal', label: 'Abdominal', unit: 'mm' },
      { key: 'plMuslo', label: 'Muslo', unit: 'mm' },
      { key: 'plPantorrilla', label: 'Pantorrilla', unit: 'mm' },
      { key: 'sumaPliegues', label: 'Sumatoria de pliegues', unit: 'mm' },
    ],
  },
  {
    title: 'Somatotipo y otros',
    fields: [
      { key: 'endomorfia', label: 'Endomorfia', unit: '' },
      { key: 'mesomorfia', label: 'Mesomorfia', unit: '' },
      { key: 'ectomorfia', label: 'Ectomorfia', unit: '' },
      { key: 'fcReposo', label: 'FC en reposo', unit: 'lpm' },
      { key: 'vo2max', label: 'VO₂ máx', unit: 'ml/kg/min' },
    ],
  },
];
export const MEASURE_FIELDS = MEASURE_GROUPS.flatMap((g) => g.fields);
export const MEASURE_FIELD = Object.fromEntries(MEASURE_FIELDS.map((f) => [f.key, f]));

// `meta`: valor de referencia diario que usa Fitia (se reemplaza por el de la captura si viene en `metas`).
// En "a limitar" la meta es un máximo.
export const NUTRITION_GROUPS = [
  {
    title: 'Del día',
    fields: [
      { key: 'kcal', label: 'Calorías', unit: 'kcal' },
      { key: 'proteina', label: 'Proteína', unit: 'g' },
      { key: 'carbohidratos', label: 'Carbohidratos', unit: 'g' },
      { key: 'grasa', label: 'Grasa', unit: 'g' },
      { key: 'fibra', label: 'Fibra', unit: 'g', meta: 38 },
      { key: 'agua', label: 'Agua', unit: 'L' },
    ],
  },
  {
    title: 'Metas de Fitia',
    fields: [
      { key: 'kcalObjetivo', label: 'Meta de calorías', unit: 'kcal' },
      { key: 'proteinaObjetivo', label: 'Meta de proteína', unit: 'g' },
      { key: 'carbObjetivo', label: 'Meta de carbohidratos', unit: 'g' },
      { key: 'grasaObjetivo', label: 'Meta de grasa', unit: 'g' },
    ],
  },
  {
    title: 'Nutrientes a limitar',
    limit: true,
    fields: [
      { key: 'grasaSat', label: 'Grasa saturada', unit: 'g', meta: 22 },
      { key: 'grasaTrans', label: 'Grasa trans', unit: 'g', meta: 2.2 },
      { key: 'azucar', label: 'Azúcar añadido', unit: 'g', meta: 25 },
      { key: 'sal', label: 'Sal', unit: 'g', meta: 5.5 },
      { key: 'sodio', label: 'Sodio', unit: 'mg', meta: 2200 },
      { key: 'alcohol', label: 'Alcohol', unit: 'g' },
    ],
  },
  {
    title: 'Vitaminas',
    micro: true,
    fields: [
      { key: 'vitA', label: 'Vitamina A', unit: 'mcg', meta: 900 },
      { key: 'vitC', label: 'Vitamina C', unit: 'mg', meta: 90 },
      { key: 'vitD', label: 'Vitamina D', unit: 'mcg', meta: 15 },
      { key: 'vitE', label: 'Vitamina E', unit: 'mg', meta: 15 },
      { key: 'vitK', label: 'Vitamina K', unit: 'mcg', meta: 120 },
      { key: 'vitB1', label: 'Vitamina B1 (tiamina)', unit: 'mg', meta: 1.2 },
      { key: 'vitB2', label: 'Vitamina B2 (riboflavina)', unit: 'mg', meta: 1.3 },
      { key: 'vitB3', label: 'Vitamina B3 (niacina)', unit: 'mg', meta: 16 },
      { key: 'vitB5', label: 'Vitamina B5', unit: 'mg', meta: 5 },
      { key: 'vitB6', label: 'Vitamina B6', unit: 'mg', meta: 1.3 },
      { key: 'vitB12', label: 'Vitamina B12', unit: 'mcg', meta: 2.4 },
      { key: 'folato', label: 'Folato', unit: 'mcg', meta: 400 },
    ],
  },
  {
    title: 'Minerales',
    micro: true,
    fields: [
      { key: 'calcio', label: 'Calcio', unit: 'mg', meta: 1000 },
      { key: 'hierro', label: 'Hierro', unit: 'mg', meta: 8 },
      { key: 'magnesio', label: 'Magnesio', unit: 'mg', meta: 420 },
      { key: 'fosforo', label: 'Fósforo', unit: 'mg', meta: 700 },
      { key: 'potasio', label: 'Potasio', unit: 'mg', meta: 3500 },
      { key: 'zinc', label: 'Zinc', unit: 'mg', meta: 11 },
      { key: 'selenio', label: 'Selenio', unit: 'mcg', meta: 55 },
      { key: 'cobre', label: 'Cobre', unit: 'mcg', meta: 900 },
      { key: 'manganeso', label: 'Manganeso', unit: 'mg', meta: 2.3 },
    ],
  },
];
export const NUTRITION_FIELDS = NUTRITION_GROUPS.flatMap((g) => g.fields);
export const NUTRITION_FIELD = Object.fromEntries(NUTRITION_FIELDS.map((f) => [f.key, f]));
export const MICRO_FIELDS = NUTRITION_GROUPS.filter((g) => g.micro).flatMap((g) => g.fields);
export const LIMIT_FIELDS = NUTRITION_GROUPS.find((g) => g.limit).fields.filter((f) => f.meta);
export const FOOD_QUALITY = ['Muy bajo', 'Bajo', 'Regular', 'Bueno', 'Excelente'];
// Meta (o máximo) de un nutriente para un registro: la de la captura o la de referencia.
export const metaOf = (entry, key) => Number(entry?.metas?.[key]) || NUTRITION_FIELD[key]?.meta || null;

// Resumen semanal de Fitia ("Score nutricional"): puntaje y promedios diarios de la semana.
export const WEEKLY_GROUPS = [
  {
    title: 'Score nutricional',
    fields: [
      { key: 'score', label: 'Puntaje', unit: '' },
      { key: 'scoreMax', label: 'Puntaje máximo', unit: '' },
      { key: 'diasRegistrados', label: 'Días registrados', unit: 'días' },
    ],
  },
  { title: 'Promedio diario de la semana', fields: NUTRITION_GROUPS[0].fields.filter((f) => f.key !== 'agua').concat(NUTRITION_GROUPS[1].fields.slice(0, 2)) },
  ...NUTRITION_GROUPS.slice(2),
];
export const WEEKLY_FIELDS = WEEKLY_GROUPS.flatMap((g) => g.fields);
export const isWeekly = (n) => n?.periodo === 'semana';

// Actividades de cardio (natación, caminata, bicicleta…), normalmente desde Samsung Health.
export const ACTIVITY_TYPES = {
  natacion: 'Natación',
  caminata: 'Caminata',
  carrera: 'Carrera',
  bicicleta: 'Bicicleta',
  eliptica: 'Elíptica',
  otro: 'Otra actividad',
};
export const ACTIVITY_FIELDS = [
  { key: 'distancia', label: 'Distancia', unit: 'm' },
  { key: 'duracionMin', label: 'Duración total', unit: 'min' },
  { key: 'activoMin', label: 'Tiempo en movimiento', unit: 'min' },
  { key: 'fcMedia', label: 'FC media', unit: 'lpm' },
  { key: 'fcMax', label: 'FC máxima', unit: 'lpm' },
  { key: 'kcal', label: 'Calorías', unit: 'kcal' },
  { key: 'pasos', label: 'Pasos', unit: '' },
  { key: 'brazadas', label: 'Brazadas', unit: '' },
  { key: 'swolf', label: 'SWOLF medio', unit: '' },
  { key: 'largoPiscina', label: 'Largo de la piscina', unit: 'm' },
];
// Ritmo por 100 m (natación) o por km (resto), en segundos.
export function activityPace(a) {
  const d = Number(a?.valores?.distancia); const t = Number(a?.valores?.activoMin || a?.valores?.duracionMin);
  if (!d || !t) return null;
  const per = a.tipo === 'natacion' ? 100 : 1000;
  return (t * 60) / (d / per);
}
export const fmtClock = (secs) => {
  if (secs == null || !Number.isFinite(secs)) return '—';
  const s = Math.round(secs); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
export const paceLabel = (a) => { const p = activityPace(a); return p == null ? null : `${fmtClock(p)} /${a.tipo === 'natacion' ? '100 m' : 'km'}`; };

// Prioridad cuando un mismo valor viene de varias fuentes el mismo día:
// el reloj (Samsung Health) es la referencia; luego báscula, cinta y registro manual.
export const SOURCE_PRIORITY = ['reloj', 'bioimpedancia', 'antropometria', 'manual'];
export const SOURCE_SHORT = { reloj: 'Reloj', bioimpedancia: 'Báscula', antropometria: 'Cinta', manual: 'Manual' };
// Excepciones por dato: el peso y el IMC se toman de la báscula. El resto (grasa corporal, masa libre de grasa,
// metabolismo basal…) sigue la prioridad general, con el reloj primero.
export const FIELD_PRIORITY = {
  peso: ['bioimpedancia', 'reloj', 'antropometria', 'manual'],
  imc: ['bioimpedancia', 'reloj', 'antropometria', 'manual'],
};
const rankFor = (key, t) => { const order = FIELD_PRIORITY[key] || SOURCE_PRIORITY; const i = order.indexOf(t); return i < 0 ? order.length : i; };
const rank = (t) => rankFor(null, t);

// Une todos los registros de una misma fecha en uno. Devuelve, por fecha:
// { date, valores, fuente: {clave: tipo}, tipos: [...], entries: [...] }, ordenado por fecha.
export function mergeMeasurementsByDate(list) {
  const byDate = new Map();
  for (const m of list) {
    if (!m?.date) continue;
    const g = byDate.get(m.date) || { date: m.date, valores: {}, fuente: {}, tipos: [], entries: [] };
    g.entries.push(m);
    byDate.set(m.date, g);
  }
  for (const g of byDate.values()) {
    g.entries.sort((a, b) => rank(a.tipo) - rank(b.tipo));
    for (const e of g.entries) if (!g.tipos.includes(e.tipo)) g.tipos.push(e.tipo);
    // Por cada dato gana la fuente de mayor prioridad para ese dato.
    const keys = new Set(g.entries.flatMap((e) => Object.keys(e.valores || {})));
    for (const k of keys) {
      const best = g.entries.filter((e) => e.valores?.[k] != null && e.valores[k] !== '')
        .sort((a, b) => rankFor(k, a.tipo) - rankFor(k, b.tipo))[0];
      if (best) { g.valores[k] = best.valores[k]; g.fuente[k] = best.tipo; }
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
