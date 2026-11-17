import type { Client } from '../types'

/**
 * Precio mensual del plan VIP ($2,000 o más). Solo hay dos planes — Básico
 * (menos de $2,000) y VIP — y el VIP incluye la antropometría completa
 * (circunferencias, pliegues y diámetros) además de los módulos exclusivos de
 * análisis corporal: perfil de pérdida, somatotipo y, en entregas siguientes,
 * dietocálculo y equivalentes. Constante en código: cambiarla no toca la base.
 */
export const VIP_PRICE = 2000

/** El plan VIP incluye circunferencias, pliegues y diámetros óseos. */
export const hasFullAnthro = (client?: Pick<Client, 'price'> | null) =>
  Number(client?.price ?? 0) >= VIP_PRICE

/** El plan VIP habilita el perfil de pérdida y los módulos exclusivos. */
export const hasVip = (client?: Pick<Client, 'price'> | null) =>
  Number(client?.price ?? 0) >= VIP_PRICE

export const anthroPlanLabel = (client?: Pick<Client, 'price'> | null) =>
  hasVip(client) ? 'Plan VIP' : 'Plan Básico'

/**
 * El plan de alimentación en dos presentaciones: estructurado (macros y
 * comidas) o el PDF que sube el coach. Ambas cuentan como el mismo apartado
 * de «alimentación» para la regla del Básico.
 */
export const hasFoodPlan = (client?: Pick<Client, 'mealPlanId' | 'mealPdfKey'> | null) =>
  Boolean(client?.mealPlanId || client?.mealPdfKey)

/**
 * Regla del plan Básico: incluye UN solo apartado — rutina de entrenamiento
 * o plan de alimentación, nunca los dos. Con VIP ($2,000+) entran ambos.
 */
export const onePlanConflict = (
  client?: Pick<Client, 'price' | 'routineId' | 'mealPlanId' | 'mealPdfKey'> | null,
) => Boolean(client && !hasFullAnthro(client) && client.routineId && hasFoodPlan(client))

/** Mensaje de la regla para avisos en la UI del coach. */
export const ONE_PLAN_MESSAGE =
  'El plan Básico incluye un solo apartado: rutina de entrenamiento o plan de alimentación, nunca los dos. Con VIP ($2,000 o más) entran ambos.'
