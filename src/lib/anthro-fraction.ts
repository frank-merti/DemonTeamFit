import type { AnthroRecord } from '../types'

/** Sexo biológico usado por Lee 2000 (constante ±2.4). */
type Sexo = 'masculino' | 'femenino'

/**
 * Fraccionamiento anatómico en 4 componentes (protocolo ISAK, restricted
 * profile): masa adiposa (Kerr), ósea (Rocha), muscular (Lee 2000) y
 * residual derivada (órganos internos y piel). Todo se calcula en el
 * momento a partir de la medición ISAK completa — no se guarda nada.
 *
 * Exclusivo del plan VIP: el perfil de pérdida del portal lo consume.
 */

/** Cuotas de composición en kg y como % de la masa corporal. */
export interface BodyComposition {
  /** Σ8 pliegues cutáneos en mm. */
  sum8: number
  /** %grasa de Kerr, calculado con los 8 pliegues (no el capturado). */
  fatPercent: number
  fat: number
  bone: number
  muscle: number
  residual: number
  fatShare: number
  boneShare: number
  muscleShare: number
  residualShare: number
}

/** Campos requeridos por el fraccionamiento (medición ISAK completa). */
export function hasFractionData(record?: AnthroRecord | null): boolean {
  if (!record || !record.weight || !record.height) return false
  return (
    record.skinfoldTriceps > 0 && record.skinfoldBiceps > 0 &&
    record.skinfoldSubscapular > 0 && record.skinfoldIliac > 0 &&
    record.skinfoldSupraspinal > 0 && record.skinfoldAbdominal > 0 &&
    record.skinfoldThigh > 0 && record.skinfoldCalf > 0 &&
    record.armFlexed > 0 && record.calf > 0 && record.thigh > 0 &&
    record.diameterElbow > 0 && record.diameterKnee > 0
  )
}

/**
 * %grasa de Kerr (1988) a partir de Σ8 pliegues en mm:
 * entre 20 y 90 mm es lineal; por encima, polinómica. Se ajusta a ≥ 0
 * para los perfiles muy magros donde la recta caería bajo cero.
 */
export function kerrFatPercent(sum8: number): number {
  const percent = sum8 <= 90
    ? 0.1052 * sum8 - 2.288
    : 0.0000016 * sum8 ** 3 - 0.0002 * sum8 ** 2 + 0.2749 * sum8 + 3.4651
  return Math.max(0, percent)
}

/**
 * Descompone la masa corporal de una medición completa en sus 4
 * componentes. Si falta algún dato ISAK devuelve null (la medición
 * básica del plan Básico no alcanza).
 */
export function bodyComposition(
  record: AnthroRecord,
  sexo?: Sexo | null,
): BodyComposition | null {
  if (!hasFractionData(record)) return null

  const sum8 =
    record.skinfoldTriceps + record.skinfoldBiceps + record.skinfoldSubscapular +
    record.skinfoldIliac + record.skinfoldSupraspinal + record.skinfoldAbdominal +
    record.skinfoldThigh + record.skinfoldCalf

  // Masa adiposa: Kerr con Σ8. Se usa el % CALCULADO, no el capturado.
  const fatPercent = kerrFatPercent(sum8)
  const fat = (record.weight * fatPercent) / 100

  // Masa ósea: Rocha con los diámetros de húmero (codo) y fémur (rodilla).
  // La estatura entra en decímetros.
  const boneIndex = 0.00716 * record.diameterElbow + 0.00336 * record.diameterKnee
  const bone = 3.02 * ((record.height / 10) * boneIndex) ** 2

  // Masa muscular: Lee (2000) con circunferencias corregidas por su pliegue.
  const armCorrected = record.armFlexed - Math.PI * (record.skinfoldTriceps / 10)
  const calfCorrected = record.calf - Math.PI * (record.skinfoldCalf / 10)
  const thighCorrected = record.thigh - Math.PI * (record.skinfoldThigh / 10)
  // Constante por sexo: +2.4 en hombres, −2.4 en mujeres.
  const leeConstant = (sexo ?? 'masculino') === 'femenino' ? -2.4 : 2.4
  const muscle =
    (record.height / 100) *
      (0.00744 * armCorrected ** 2 +
        0.00088 * calfCorrected ** 2 +
        0.00421 * thighCorrected ** 2) +
    leeConstant

  // Residual derivada: lo que resta (órganos internos + piel).
  const residual = record.weight - fat - bone - Math.max(0, muscle)

  const w = record.weight || 1
  const pct = (kg: number) => (kg / w) * 100
  return {
    sum8,
    fatPercent,
    fat,
    bone,
    muscle: Math.max(0, muscle),
    residual: Math.max(0, residual),
    fatShare: pct(fat),
    boneShare: pct(bone),
    muscleShare: pct(Math.max(0, muscle)),
    residualShare: pct(residual),
  }
}

/** Tono del cambio por componente (verde = avanza hacia el objetivo). */
export type ComponentTone = 'good' | 'bad' | 'warn' | 'neutral'

export interface FractionRow {
  key: 'fat' | 'muscle' | 'bone' | 'residual'
  label: string
  /** Kg actuales y de la medición previa (null si no hay previa). */
  actual: number
  previous: number | null
  /** Diferencia actual − previo (null si no hay previa). */
  diff: number | null
  tone: ComponentTone
}

const COMPONENTS: Array<{ key: FractionRow['key']; label: string }> = [
  { key: 'fat', label: 'Masa grasa' },
  { key: 'muscle', label: 'Masa muscular' },
  { key: 'bone', label: 'Masa ósea' },
  { key: 'residual', label: 'Masa residual' },
]

/**
 * Arma las filas de la tabla Actual | Previo | Diferencia con su semáforo
 * según la regla del objetivo de pérdida: bajar grasa es verde, subir
 * músculo es verde; el hueso no debería moverse (±0.5 kg) y el residual
 * es neutro.
 */
export function fractionRows(
  current: BodyComposition,
  previous?: BodyComposition | null,
): FractionRow[] {
  return COMPONENTS.map(({ key, label }) => {
    const actual = current[key]
    const prev = previous?.[key] ?? null
    const diff = previous ? actual - previous[key] : null
    let tone: ComponentTone = 'neutral'
    if (diff !== null && Math.abs(diff) >= 0.05) {
      if (key === 'fat') tone = diff < 0 ? 'good' : 'bad'
      else if (key === 'muscle') tone = diff > 0 ? 'good' : 'bad'
      else if (key === 'bone') tone = Math.abs(diff) <= 0.5 ? 'good' : 'warn'
    }
    return { key, label, actual, previous: prev, diff, tone }
  })
}

const kg = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)} kg`
const abs = (n: number) => `${n.toFixed(1)} kg`

/** Fecha corta para las notas, p. ej. «el 12 nov». */
const fmtShort = (iso?: string) => {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return ` del ${Number(d)} ${months[Number(m) - 1] ?? ''}`
}

/**
 * Nota interpretativa automática: traduce la dirección de cada componente
 * a 1–2 líneas que el cliente entiende sin saber de antropometría.
 */
export function fractionNote(
  current: BodyComposition,
  previous?: BodyComposition | null,
  previousDate?: string,
): string {
  if (!previous) {
    return 'Es tu primera medición completa. A partir de la próxima, aquí '
      + 'verás qué perdiste y qué ganaste: grasa que baja y músculo que sube '
      + 'es la meta.'
  }
  const dFat = current.fat - previous.fat
  const dMuscle = current.muscle - previous.muscle
  const when = fmtShort(previousDate)
  const fatUp = dFat >= 0.05
  const muscleUp = dMuscle >= 0.05
  const fatStable = Math.abs(dFat) < 0.05
  const muscleStable = Math.abs(dMuscle) < 0.05

  if (dFat <= -0.05 && muscleUp) {
    return `Desde tu medición${when} perdiste ${abs(-dFat)} de grasa y ganaste `
      + `${abs(dMuscle)} de músculo. Tu peso casi no se movió porque el `
      + 'músculo pesa: eso es recomposición.'
  }
  if (dFat <= -0.05) {
    return `Desde tu medición${when} perdiste ${abs(-dFat)} de grasa`
      + (muscleStable
        ? ' y mantuviste tu músculo. Vas por buen camino.'
        : `, aunque el músculo bajó ${abs(-dMuscle)}. Lo vigilamos para `
          + 'protegerlo con más proteína y carga en el entrenamiento.')
  }
  if (fatUp && muscleUp) {
    return `Desde tu medición${when} subiste ${abs(dFat)} de grasa y `
      + `${abs(dMuscle)} de músculo. Ajustamos la alimentación para que el `
      + 'siguiente mes solo crezca el músculo.'
  }
  if (fatUp) {
    return `Desde tu medición${when} subiste ${abs(dFat)} de grasa`
      + (muscleStable ? '. Lo revisamos juntos en la próxima visita.' :
        ` y bajaste ${abs(-dMuscle)} de músculo. Ajustamos plan y rutina.`)
  }
  return fatStable && muscleStable
    ? `Tu composición se mantiene casi igual desde la medición${when}.`
    : `Cambios pequeños desde la medición${when}: ${dFat >= 0 ? '+' : ''}`
      + `${dFat.toFixed(1)} kg de grasa, ${kg(dMuscle)} de músculo.`
}
