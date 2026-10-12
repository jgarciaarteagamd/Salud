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
      { key: 'masaMagra', label: 'Masa libre de grasa', unit: 'kg' },
      { key: 'aguaPct', label: 'Agua corporal', unit: '%' },
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

export const NUTRITION_GROUPS = [
  {
    title: 'Del día',
    fields: [
      { key: 'kcal', label: 'Calorías', unit: 'kcal' },
      { key: 'proteina', label: 'Proteína', unit: 'g' },
      { key: 'carbohidratos', label: 'Carbohidratos', unit: 'g' },
      { key: 'grasa', label: 'Grasa', unit: 'g' },
      { key: 'fibra', label: 'Fibra', unit: 'g' },
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
    title: 'Detalle',
    fields: [
      { key: 'grasaSat', label: 'Grasa saturada', unit: 'g' },
      { key: 'grasaTrans', label: 'Grasa trans', unit: 'g' },
      { key: 'azucar', label: 'Azúcar', unit: 'g' },
      { key: 'sal', label: 'Sal', unit: 'g' },
      { key: 'sodio', label: 'Sodio', unit: 'mg' },
      { key: 'alcohol', label: 'Alcohol', unit: 'g' },
    ],
  },
];
export const NUTRITION_FIELDS = NUTRITION_GROUPS.flatMap((g) => g.fields);

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
const rank = (t) => { const i = SOURCE_PRIORITY.indexOf(t); return i < 0 ? SOURCE_PRIORITY.length : i; };

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
    for (const e of g.entries) {
      if (!g.tipos.includes(e.tipo)) g.tipos.push(e.tipo);
      for (const [k, v] of Object.entries(e.valores || {})) {
        if (v == null || v === '' || k in g.valores) continue; // gana la fuente de mayor prioridad
        g.valores[k] = v; g.fuente[k] = e.tipo;
      }
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
