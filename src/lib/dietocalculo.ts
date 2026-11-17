/**
 * Dietocálculo con grupos y raciones tipo (0.27.4): convierte la meta de
 * kcal del cliente en raciones por grupo de alimentos — verduras, frutas,
 * cereales, leguminosas, AOA, leche, aceites y azúcar — y verifica con
 * barras de adecuación que lo repartido cumple el objetivo de macros.
 *
 * Todo es cálculo al momento en el navegador; no se guarda nada (v1 sin
 * catálogo ni migraciones). Exclusivo del plan VIP en la entrega al
 * cliente: la alimentación solo llega por plan estructurado o PDF, vías
 * que ya bloquean a un cliente Básico con rutina.
 */

export type Sex = 'M' | 'F'
export type Objetivo = 'mantener' | 'perder' | 'ganar'

export interface GrupoEquivalente {
  key: string
  label: string
  /** Valor nutrimental de UNA ración. */
  kcal: number
  cho: number
  pro: number
  lip: number
  /** Equivalencia casera de una ración. */
  serving: string
}

/** Sistema Mexicano de Equivalentes, tabla tipo nutre.in. */
export const GRUPOS_EQUIVALENTES: GrupoEquivalente[] = [
  { key: 'ver', label: 'Verduras', kcal: 25, cho: 4, pro: 0, lip: 0, serving: '1 taza cruda · ½ taza cocida' },
  { key: 'fru', label: 'Frutas', kcal: 60, cho: 15, pro: 0, lip: 0, serving: '1 pieza mediana · 1 taza' },
  { key: 'cer', label: 'Cereales', kcal: 70, cho: 15, pro: 3, lip: 0, serving: '1 pan · ½ taza de arroz/pasta cocida' },
  { key: 'leg', label: 'Leguminosas', kcal: 120, cho: 20, pro: 8, lip: 0.5, serving: '½ taza cocida' },
  { key: 'aoa', label: 'AOA', kcal: 55, cho: 0, pro: 7, lip: 3, serving: '30 g pollo/res/pescado · 1 huevo' },
  { key: 'lec', label: 'Leche', kcal: 120, cho: 12, pro: 8, lip: 4, serving: '1 taza semidescremada' },
  { key: 'ace', label: 'Aceites', kcal: 45, cho: 0, pro: 0, lip: 5, serving: '1 cdta de aceite/mantequilla' },
  { key: 'azu', label: 'Azúcar', kcal: 20, cho: 5, pro: 0, lip: 0, serving: '1 cdta de azúcar/miel' },
]

/** AOA = alimentos de origen animal bajos en grasa. */

export const FACTORES_ACTIVIDAD = [
  { key: 'sedentario', label: 'Sedentario', factor: 1.2 },
  { key: 'ligero', label: 'Ligero (1–3 d/semana)', factor: 1.375 },
  { key: 'moderado', label: 'Moderado (3–5 d/semana)', factor: 1.55 },
  { key: 'activo', label: 'Activo (6–7 d/semana)', factor: 1.725 },
  { key: 'muyActivo', label: 'Muy activo (doble sesión)', factor: 1.9 },
] as const

export type ActividadKey = (typeof FACTORES_ACTIVIDAD)[number]['key']

/** Presets aprobados: % CHO-PRO-LIP. */
export const PRESETS_MACROS = [
  { key: 'resistencia', label: '60-25-15', label_full: 'Resistencia', cho: 60, pro: 25, lip: 15 },
  { key: 'mantenimiento', label: '55-25-20', label_full: 'Mantenimiento', cho: 55, pro: 25, lip: 20 },
  { key: 'perder', label: '50-30-20', label_full: 'Pérdida de grasa', cho: 50, pro: 30, lip: 20 },
  { key: 'recomp', label: '45-30-25', label_full: 'Recomposición', cho: 45, pro: 30, lip: 25 },
] as const

export interface MacrosPct {
  cho: number
  pro: number
  lip: number
}

/** Mifflin-St Jeor: BMR en kcal. */
export function mifflinStJeor(sexo: Sex, peso: number, estatura: number, edad: number): number {
  const base = 10 * peso + 6.25 * estatura - 5 * edad
  return sexo === 'M' ? base + 5 : base - 161
}

export function tdee(bmr: number, actividad: ActividadKey): number {
  const factor = FACTORES_ACTIVIDAD.find((a) => a.key === actividad)?.factor ?? 1.55
  return bmr * factor
}

/** Meta de kcal según el objetivo: mantener, perder (−20%) o ganar (+10%).
 * Redondeo a 10; en «perder» nunca queda por debajo del BMR. */
export function metaKcal(tdee: number, bmr: number, objetivo: Objetivo): number {
  const raw = objetivo === 'perder' ? tdee * 0.8 : objetivo === 'ganar' ? tdee * 1.1 : tdee
  const floor = objetivo === 'perder' ? bmr : 0
  return Math.max(Math.round(floor / 10) * 10, Math.round(raw / 10) * 10)
}

/** Gramos de macros a partir del reparto porcentual (CHO/PRO 4 kcal/g, LIP 9). */
export function macrosDeKcal(kcal: number, pct: MacrosPct): MacrosPct {
  return {
    cho: Math.round((kcal * pct.cho) / 100 / 4),
    pro: Math.round((kcal * pct.pro) / 100 / 4),
    lip: Math.round((kcal * pct.lip) / 100 / 9),
  }
}

/** Sanity check de proteína: en «perder» se pide ≥ 1.2 g/kg. */
export function proteinaOk(proG: number, peso: number, objetivo: Objetivo): boolean {
  return objetivo !== 'perder' || proG >= 1.2 * peso
}

export type Raciones = Record<string, number>

/** Suma de kcal y gramos aportados por las raciones elegidas. */
export function aportesTotales(raciones: Raciones): { kcal: number; cho: number; pro: number; lip: number } {
  const out = { kcal: 0, cho: 0, pro: 0, lip: 0 }
  for (const g of GRUPOS_EQUIVALENTES) {
    const q = raciones[g.key] ?? 0
    out.kcal += g.kcal * q
    out.cho += g.cho * q
    out.pro += g.pro * q
    out.lip += g.lip * q
  }
  return out
}

/** Sugerencia automática (punto de partida): base fija según la meta,
 * luego cereales (CHO restante), AOA (PRO restante) y aceites (LIP
 * restante), sin números negativos. */
export function racionesSugeridas(kcal: number, macros: MacrosPct): Raciones {
  const baja = kcal < 1500
  const base: Raciones = { ver: baja ? 3 : 4, fru: baja ? 2 : 3, leg: baja ? 1 : 2, lec: baja ? 1 : 2 }
  const aportes = aportesTotales(base)
  // Redondeo conservador (floor) en AOA y aceites: la sugerencia nunca
  // dispara la proteína ni la grasa por encima del objetivo; las barras
  // de adecuación muestran el ajuste fino que hace el coach.
  const cer = Math.max(0, Math.round((macros.cho - aportes.cho) / 15))
  const aoa = Math.max(0, Math.floor((macros.pro - aportes.pro - cer * 3) / 7))
  const ace = Math.max(0, Math.floor((macros.lip - aportes.lip - aoa * 3) / 5))
  return { ...base, cer, aoa, ace, azu: 0 }
}

/** Adecuación: % del objetivo que cubren las raciones, por macro. */
export function adecuacion(aporte: number, objetivo: number): number {
  if (objetivo <= 0) return 0
  return Math.round((aporte / objetivo) * 100)
}

/** Semáforo de la adecuación: 90–110% verde; 70–90 y 110–130 ámbar;
 * fuera de ese rango, rojo. */
export function adecuacionTone(pct: number): 'good' | 'warn' | 'bad' {
  if (pct >= 90 && pct <= 110) return 'good'
  if ((pct >= 70 && pct < 90) || (pct > 110 && pct <= 130)) return 'warn'
  return 'bad'
}

/** Tiempos de comida del menú v1 (solo lectura): reparto estándar. */
export const TIEMPOS = [
  { key: 'des', label: 'Desayuno', share: 0.25 },
  { key: 'col1', label: 'Colación 1', share: 0.1 },
  { key: 'com', label: 'Comida', share: 0.35 },
  { key: 'col2', label: 'Colación 2', share: 0.1 },
  { key: 'cen', label: 'Cena', share: 0.2 },
] as const

/** Reparto de las raciones totales por tiempo de comida. Los sobrantes
 * del redondeo van al tiempo con mayor parte fraccionaria. */
export function repartoPorTiempos(raciones: Raciones): Record<string, Raciones> {
  const out: Record<string, Raciones> = {}
  for (const g of GRUPOS_EQUIVALENTES) {
    const total = raciones[g.key] ?? 0
    const row: Raciones = {}
    if (total === 0) {
      for (const t of TIEMPOS) row[t.key] = 0
    } else {
      const raw = TIEMPOS.map((t) => total * t.share)
      const floors = raw.map(Math.floor)
      let left = total - floors.reduce((a, b) => a + b, 0)
      // Ordena los tiempos por parte fraccionaria descendente (índice estable).
      const order = raw
        .map((v, i) => ({ i, frac: v - Math.floor(v) }))
        .sort((a, b) => b.frac - a.frac)
      let cursor = 0
      while (left > 0) {
        floors[order[cursor % order.length].i] += 1
        left -= 1
        cursor += 1
      }
      TIEMPOS.forEach((t, i) => { row[t.key] = floors[i] })
    }
    out[g.key] = row
  }
  return out
}
