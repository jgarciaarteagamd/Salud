// Grupos musculares que usa la app. `id` es la clave guardada en los ejercicios y sesiones.
// `min`/`max`: rango orientativo de series efectivas por semana (hipertrofia, nivel intermedio).
export const MUSCLES = [
  { id: 'pecho', name: 'Pecho', group: 'Empuje', min: 10, max: 20 },
  { id: 'deltoide_ant', name: 'Deltoides anterior', short: 'Hombro ant.', group: 'Empuje', min: 6, max: 14 },
  { id: 'deltoide_lat', name: 'Deltoides lateral', short: 'Hombro lat.', group: 'Empuje', min: 8, max: 20 },
  { id: 'deltoide_post', name: 'Deltoides posterior', short: 'Hombro post.', group: 'Tirón', min: 6, max: 16 },
  { id: 'triceps', name: 'Tríceps', group: 'Empuje', min: 6, max: 14 },
  { id: 'biceps', name: 'Bíceps', group: 'Tirón', min: 8, max: 16 },
  { id: 'antebrazo', name: 'Antebrazo', group: 'Tirón', min: 2, max: 10 },
  { id: 'dorsales', name: 'Dorsales', group: 'Tirón', min: 10, max: 20 },
  { id: 'espalda_media', name: 'Espalda media', short: 'Esp. media', group: 'Tirón', min: 8, max: 18 },
  { id: 'trapecio', name: 'Trapecio', group: 'Tirón', min: 2, max: 12 },
  { id: 'lumbar', name: 'Lumbar', group: 'Core', min: 2, max: 8 },
  { id: 'abdomen', name: 'Abdomen', group: 'Core', min: 6, max: 16 },
  { id: 'oblicuos', name: 'Oblicuos', group: 'Core', min: 4, max: 12 },
  { id: 'gluteos', name: 'Glúteos', group: 'Pierna', min: 6, max: 16 },
  { id: 'abductores', name: 'Glúteo medio / abductores', short: 'Abductores', group: 'Pierna', min: 4, max: 12 },
  { id: 'aductores', name: 'Aductores', group: 'Pierna', min: 2, max: 10 },
  { id: 'cuadriceps', name: 'Cuádriceps', group: 'Pierna', min: 8, max: 18 },
  { id: 'isquios', name: 'Isquiotibiales', short: 'Isquios', group: 'Pierna', min: 6, max: 16 },
  { id: 'pantorrillas', name: 'Pantorrillas', group: 'Pierna', min: 6, max: 14 },
];

export const MUSCLE = Object.fromEntries(MUSCLES.map((m) => [m.id, m]));
export const muscleName = (id) => MUSCLE[id]?.name ?? id;
export const muscleShort = (id) => MUSCLE[id]?.short ?? MUSCLE[id]?.name ?? id;

// Una serie cuenta 1 para el músculo principal y 0.5 para los secundarios.
export const SECONDARY_WEIGHT = 0.5;

export const SAFETY = {
  ok: { label: 'Apto', cls: 'good' },
  precaucion: { label: 'Con cuidado', cls: 'warn' },
  evitar: { label: 'Evitar', cls: 'bad' },
};
