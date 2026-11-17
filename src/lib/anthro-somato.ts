import type { AnthroRecord } from '../types'
import { hasFractionData } from './anthro-fraction'

/**
 * Somatotipo Heath-Carter: describe la FORMA del cuerpo con tres valores
 * en escala 1–7 — endomorfia (grasa relativa), mesomorfia (músculo y
 * hueso) y ectomorfia (linealidad). Se calcula al momento con la misma
 * medición ISAK completa del fraccionamiento; no se guarda nada.
 *
 * Exclusivo del plan VIP: el perfil de pérdida del portal lo consume.
 */

export interface SomatoType {
  endo: number
  meso: number
  ecto: number
  /** Coordenadas oficiales para la somatocarta. */
  x: number
  y: number
  /** Clasificación de Carter, p. ej. «Mesomórfico endomorfo». */
  category: string
}

/**
 * Endomorfia: regresión cúbica de Carter con Σ3 pliegues (tríceps,
 * subescapular y cresta ilíaca) corregidos por estatura. Se ajusta a un
 * mínimo de 0.5 en los perfiles muy magros.
 */
export function endomorphy(record: AnthroRecord): number {
  const x3 =
    ((record.skinfoldTriceps + record.skinfoldSubscapular + record.skinfoldSupraspinal) *
      170.18) / record.height
  return Math.max(0.5, -0.7182 + 0.1451 * x3 - 0.00068 * x3 ** 2 + 0.0000014 * x3 ** 3)
}

/**
 * Mesomorfia: regresión de Carter con el esqueleto (diámetros de húmero
 * y fémur) y el músculo (circunferencias corregidas) relativos a la
 * estatura, en decímetros.
 */
export function mesomorphy(record: AnthroRecord): number {
  const armCorrected = record.armFlexed - Math.PI * (record.skinfoldTriceps / 10)
  const calfCorrected = record.calf - Math.PI * (record.skinfoldCalf / 10)
  const heightDm = record.height / 10
  const value =
    (0.858 * (record.diameterElbow + record.diameterKnee + armCorrected + calfCorrected)) /
    heightDm
  return Math.max(0.5, value)
}

/**
 * Ectomorfia con el índice HWR (estatura en cm ÷ raíz cúbica de la masa
 * en kg), por tramos de la regresión de Heath-Carter. El primer tramo
 * (hasta HWR 40.75) es la fórmula publicada; en los tramos altos la
 * pendiente crece con la linealidad y se mantiene continua.
 */
export function ectomorphy(record: AnthroRecord): number {
  const hwr = record.height / Math.cbrt(record.weight)
  if (hwr <= 40.75) return Math.max(0.5, 0.464 + 0.18 * (hwr - 38.25))
  if (hwr <= 42.75) return Math.max(0.5, 0.914 + 0.5 * (hwr - 40.75))
  return Math.max(0.5, 1.914 + (hwr - 42.75))
}

const NOUNS = { endo: 'Endomorfo', meso: 'Mesomorfo', ecto: 'Ectomorfo' } as const
const ADJECTIVES = { endo: 'Endomórfico', meso: 'Mesomórfico', ecto: 'Ectomórfico' } as const

/**
 * Clasificación de Carter con la regla de dominancia: dos componentes
 * dominan si cada uno supera al tercero por 0.5 o más; si los tres
 * quedan a menos de 1 unidad, el somatotipo es «Equilibrado».
 */
export function somatoCategory(endo: number, meso: number, ecto: number): string {
  const values = { endo, meso, ecto }
  const keys = ['endo', 'meso', 'ecto'] as const
  const sorted = [...keys].sort((a, b) => values[b] - values[a])
  const [top, second, third] = sorted
  if (values[top] - values[third] < 1) return 'Equilibrado'
  if (values[second] - values[third] >= 0.5 && values[top] - values[second] < 1) {
    return `${ADJECTIVES[second]} ${NOUNS[top].toLowerCase()}`
  }
  return `${NOUNS[top]} equilibrado`
}

/** Somatotipo completo de una medición; null si no es ISAK completa. */
export function somatoType(record: AnthroRecord): SomatoType | null {
  if (!hasFractionData(record)) return null
  const endo = endomorphy(record)
  const meso = mesomorphy(record)
  const ecto = ectomorphy(record)
  return {
    endo,
    meso,
    ecto,
    x: ecto - endo,
    y: 2 * meso - (endo + ecto),
    category: somatoCategory(endo, meso, ecto),
  }
}

export interface SomatoRow {
  key: 'endo' | 'meso' | 'ecto'
  label: string
  actual: number
  previous: number | null
  diff: number | null
  tone: 'good' | 'bad' | 'neutral'
}

const SOMATO_COMPONENTS = [
  { key: 'endo', label: 'Endomorfia' },
  { key: 'meso', label: 'Mesomorfia' },
  { key: 'ecto', label: 'Ectomorfia' },
] as const

/** Filas de la tabla con semáforo: en endomorfia bajar es verde, en
 * mesomorfia subir (o mantener) es verde; la ectomorfia es informativa. */
export function somatoRows(
  current: SomatoType,
  previous?: SomatoType | null,
): SomatoRow[] {
  return SOMATO_COMPONENTS.map(({ key, label }) => {
    const actual = current[key]
    const prev = previous?.[key] ?? null
    const diff = previous ? actual - previous[key] : null
    let tone: SomatoRow['tone'] = 'neutral'
    if (diff !== null && Math.abs(diff) >= 0.1) {
      if (key === 'endo') tone = diff < 0 ? 'good' : 'bad'
      else if (key === 'meso') tone = diff > 0 ? 'good' : 'bad'
    }
    return { key, label, actual, previous: prev, diff, tone }
  })
}

const fmtTriple = (s: SomatoType) =>
  `${s.endo.toFixed(1)}–${s.meso.toFixed(1)}–${s.ecto.toFixed(1)}`

/** Nota interpretativa automática del cambio de forma corporal. */
export function somatoNote(current: SomatoType, previous?: SomatoType | null): string {
  if (!previous) {
    return `Tu clasificación actual es ${current.category.toLowerCase()} `
      + `(${fmtTriple(current)}). Con la próxima medición verás cómo se `
      + 'mueve la forma de tu cuerpo.'
  }
  const dEndo = current.endo - previous.endo
  const dMeso = current.meso - previous.meso
  let move: string
  if (dEndo <= -0.1 && Math.abs(dMeso) < 0.15) {
    move = 'menos grasa relativa con el mismo músculo: la forma está '
      + 'cambiando hacia donde planeamos'
  } else if (dEndo >= 0.1 && Math.abs(dMeso) < 0.15) {
    move = 'subió la grasa relativa manteniendo el músculo; lo revisamos '
      + 'en la próxima visita'
  } else if (dMeso >= 0.15) {
    move = 'ganó robustez muscular y ósea'
  } else if (dMeso <= -0.15) {
    move = 'bajó la robustez muscular; vigilamos la carga y la proteína'
  } else {
    move = 'cambios pequeños en la forma general'
  }
  return `Tu somatotipo se movió de ${fmtTriple(previous)} a ${fmtTriple(current)}: ${move}.`
}
