import { Check, HeartPulse, Lightbulb, Plus } from 'lucide-react'
import { MUSCLE_GROUPS, MUSCLE_INFO, UNGROUPED_LABEL, groupByMuscle } from '../lib/muscles'
import type { ExerciseCatalogItem } from '../types'
import { Modal, cx } from './ui'

/**
 * Guía de grupos musculares para el editor de rutinas: explica qué cubre cada
 * grupo y lista los ejercicios de la biblioteca en ese grupo como chips
 * tocables, para que el coach identifique y agregue más rápido. Los ejercicios
 * ya presentes en el día aparecen como «Agregado» (no se duplican).
 */
export default function MuscleGroupGuide({
  open,
  onClose,
  catalog,
  onPick,
  isAdded,
  dayName,
}: {
  open: boolean
  onClose: () => void
  catalog: ExerciseCatalogItem[]
  /** Agrega el ejercicio elegido al día que abrió la guía. */
  onPick: (item: ExerciseCatalogItem) => void
  /** True si el ejercicio ya está en el día (se muestra como «Agregado»). */
  isAdded: (item: ExerciseCatalogItem) => boolean
  dayName: string
}) {
  if (!open) return null
  const grouped = new Map(groupByMuscle(catalog, true))
  return (
    <Modal
      open
      onClose={onClose}
      title="Guía de grupos musculares"
      subtitle={`Toca un ejercicio para agregarlo a ${dayName}. Los grupos te ayudan a encontrarlo más rápido.`}
      wide
      footer={
        <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <Lightbulb size={12} className="text-brand" />
          ¿Falta un ejercicio? Créalo en la pantalla <strong>Ejercicios</strong> y aparecerá aquí.
        </p>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {MUSCLE_GROUPS.map((group) => {
          const items = grouped.get(group) ?? []
          return (
            <section key={group} className="rounded-2xl border border-line p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold">{group}</h3>
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted">
                  {items.length === 1 ? '1 ejercicio' : `${items.length} ejercicios`}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{MUSCLE_INFO[group]}</p>
              {items.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {items.map((item) => {
                    const added = isAdded(item)
                    return (
                      <button
                        key={item.id}
                        onClick={() => { if (!added) onPick(item) }}
                        disabled={added}
                        title={added ? `Ya está en ${dayName}` : `Agregar ${item.name} a ${dayName}`}
                        className={cx(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                          added
                            ? 'cursor-default border-line/70 text-muted/70'
                            : 'border-line text-ink hover:border-brand/50 hover:bg-brand-soft hover:text-brand-dark',
                        )}
                      >
                        {added ? <Check size={11} /> : <Plus size={11} />}
                        {item.name}
                        {added && <span className="sr-only">Agregado</span>}
                        {item.cardio && <HeartPulse size={11} className="text-warn" aria-label="Cardio" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
        {grouped.has(UNGROUPED_LABEL) && (
          <section className="rounded-2xl border border-dashed border-line p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">{UNGROUPED_LABEL}</h3>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted">
                {grouped.get(UNGROUPED_LABEL)!.length} sin definir
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Ejercicios de tu biblioteca con grupo sin definir; asígnalo en la pantalla Ejercicios.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {grouped.get(UNGROUPED_LABEL)!.map((item) => {
                const added = isAdded(item)
                return (
                  <button
                    key={item.id}
                    onClick={() => { if (!added) onPick(item) }}
                    disabled={added}
                    title={added ? `Ya está en ${dayName}` : `Agregar ${item.name} a ${dayName}`}
                    className={cx(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                      added
                        ? 'cursor-default border-line/70 text-muted/70'
                        : 'border-line text-ink hover:border-brand/50 hover:bg-brand-soft hover:text-brand-dark',
                    )}
                  >
                    {added ? <Check size={11} /> : <Plus size={11} />}
                    {item.name}
                    {added && <span className="sr-only">Agregado</span>}
                    {item.cardio && <HeartPulse size={11} className="text-warn" aria-label="Cardio" />}
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}
