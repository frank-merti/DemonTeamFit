/**
 * Grupos musculares canónicos. La MISMA lista:
 * - ordena la biblioteca por secciones en la página Ejercicios,
 * - agrupa el selector «Agregar desde biblioteca» en el editor de rutinas,
 * - y es la única opción válida en el editor de ejercicio.
 * Así ambas páginas quedan sincronizadas en información.
 */
export const MUSCLE_GROUPS = ['Pecho', 'Espalda', 'Hombros', 'Brazos', 'Piernas', 'Glúteos', 'Core', 'Cardio'] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

/** Qué cubre cada grupo: referencia rápida para el coach al armar la rutina. */
export const MUSCLE_INFO: Record<MuscleGroup, string> = {
  Pecho: 'Pectorales. Empujes horizontales e inclinados: press banca, press con mancuernas, aperturas y fondos.',
  Espalda: 'Dorsales y trapecio. Tirones verticales y horizontales: jalones, remos y dominadas.',
  Hombros: 'Deltoides. Press militar, elevaciones laterales y envíos; clave para postura y hombro estable.',
  Brazos: 'Bíceps, tríceps y antebrazo. Curl, extensiones y trabajo de agarre.',
  Piernas: 'Cuádriceps, femoral y pantorrilla. Sentadillas, peso muerto, prensas y extensiones.',
  Glúteos: 'Glúteo mayor y medio. Hip thrust, rumanas, abducciones y patadas.',
  Core: 'Abdomen y zona lumbar. Planchas, crunches y antirrotaciones; la base de todo el movimiento.',
  Cardio: 'Trabajo aeróbico por minutos al inicio del día: caminadora, bici, elíptica o remo.',
}

/** Etiqueta para ejercicios sin grupo reconocible. */
export const UNGROUPED_LABEL = 'Sin categoría'

/** Sinónimos frecuentes → grupo canónico (comparación sin acentos ni mayúsculas). */
const SYNONYMS: Record<string, MuscleGroup> = {
  pecho: 'Pecho', 'pecho superior': 'Pecho', 'pecho medio': 'Pecho', 'pecho inferior': 'Pecho', chest: 'Pecho',
  espalda: 'Espalda', dorsal: 'Espalda', dorsales: 'Espalda', back: 'Espalda',
  hombro: 'Hombros', hombros: 'Hombros', deltoide: 'Hombros', deltoides: 'Hombros', shoulders: 'Hombros',
  brazo: 'Brazos', brazos: 'Brazos', biceps: 'Brazos', triceps: 'Brazos', antebrazo: 'Brazos', antebrazos: 'Brazos', arms: 'Brazos',
  pierna: 'Piernas', piernas: 'Piernas', cuadriceps: 'Piernas', femoral: 'Piernas', isquiotibiales: 'Piernas', 'tren inferior': 'Piernas', legs: 'Piernas',
  gluteo: 'Glúteos', gluteos: 'Glúteos', glute: 'Glúteos',
  core: 'Core', abdomen: 'Core', abdominal: 'Core', abdominales: 'Core', abs: 'Core', lumbar: 'Core',
  cardio: 'Cardio', aerobico: 'Cardio',
}

const deaccent = (value: string) =>
  value.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Grupo canónico de un valor libre; `''` si no se reconoce (Sin categoría). */
export const normalizeMuscleGroup = (value: string): MuscleGroup | '' => {
  const key = deaccent(value)
  if (!key) return ''
  return SYNONYMS[key] ?? ''
}

/** Etiqueta de sección para agrupar: grupo canónico o «Sin categoría». */
export const groupLabelOf = (value: string) => normalizeMuscleGroup(value) || UNGROUPED_LABEL

/**
 * Agrupa una lista por grupo muscular: devuelve pares [etiqueta, items] en el
 * orden canónico (y «Sin categoría» al final). Con `cardioAsCardio`, los
 * ejercicios de tipo cardio se agrupan bajo «Cardio» aunque su grupo libre sea
 * otro — útil en el selector de rutinas, donde el cardio tiene apartado propio.
 */
export function groupByMuscle<T extends { muscleGroup?: string | null; cardio?: boolean }>(
  items: T[],
  cardioAsCardio = false,
): Array<[string, T[]]> {
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const label = cardioAsCardio && item.cardio ? 'Cardio' : groupLabelOf(item.muscleGroup ?? '')
    const list = buckets.get(label) ?? []
    list.push(item)
    buckets.set(label, list)
  }
  const order = new Map<string, number>([
    ...MUSCLE_GROUPS.map((group, index) => [group, index] as const),
    [UNGROUPED_LABEL, MUSCLE_GROUPS.length],
  ])
  return [...buckets.entries()].sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
}
