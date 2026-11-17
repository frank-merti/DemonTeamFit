import { useState } from 'react'
import { ArrowDown, ArrowUp, BookOpen, Dumbbell, HeartPulse, ImagePlus, Lightbulb, Loader2, Plus, Trash2, X } from 'lucide-react'
import { apiUploadExerciseImage, exerciseImageUrl } from '../lib/api'
import { compressExerciseImage, ExerciseImageError } from '../lib/image'
import { resolveCatalogItem } from '../lib/catalog'
import { groupByMuscle } from '../lib/muscles'
import type { ExerciseCatalogItem, Routine, RoutineDay } from '../types'
import { Button, Field, Modal, cx, inputClass, selectCompact } from './ui'
import MuscleGroupGuide from './MuscleGroupGuide'

export const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 5)}`

export const blankDay = (n: number): RoutineDay => ({
  id: uid('day'),
  name: `Día ${n}`,
  focus: '',
  exercises: [{ id: uid('ex'), name: '', sets: 3, reps: '10', rest: '60 s', restSeconds: 60 }],
})

/** Renglón nuevo de fuerza; el cardio se agrega desde la biblioteca o marcando el tipo. */
const blankExercise = (catalogItem?: ExerciseCatalogItem) => ({
  id: uid('ex'),
  name: catalogItem?.name ?? '',
  sets: catalogItem?.cardio ? 0 : 3,
  reps: catalogItem?.cardio ? '' : '10',
  rest: catalogItem?.cardio ? '' : '60 s',
  restSeconds: catalogItem?.cardio ? null : 60,
  catalogId: catalogItem?.id ?? null,
  cardio: catalogItem?.cardio ?? false,
  minutes: catalogItem?.cardio ? 20 : null,
  imageKey: catalogItem?.imageKey ?? null,
})

/** Renglón nuevo del apartado Cardio: máquina de la biblioteca + minutos. */
const blankCardio = (catalogItem?: ExerciseCatalogItem) => ({
  ...blankExercise(catalogItem),
  name: catalogItem?.name ?? '',
  sets: 0,
  reps: '',
  rest: '',
  restSeconds: null,
  catalogId: catalogItem?.id ?? null,
  cardio: true,
  minutes: 20,
})

/** Renombra solo los días que usan el patrón "Día N"; los nombres propios se conservan. */
const renumberDefaultDays = (days: RoutineDay[]) =>
  days.map((day, index) =>
    /^d[ií]a\s+\d+$/i.test(day.name.trim()) ? { ...day, name: `Día ${index + 1}` } : day,
  )

/** Orden canónico al guardar: el cardio va primero, como se entrena. */
const normalizeCardioFirst = (routine: Routine): Routine => ({
  ...routine,
  days: routine.days.map((day) => ({
    ...day,
    exercises: [
      ...day.exercises.filter((ex) => ex.cardio),
      ...day.exercises.filter((ex) => !ex.cardio),
    ],
  })),
})

export default function RoutineEditor({
  routine,
  catalog,
  notify,
  onClose,
  onSave,
  subtitle = 'Cambios aplican a todos los clientes asignados',
}: {
  routine: Routine | null
  catalog: ExerciseCatalogItem[]
  notify: (message: string, tone?: 'ok' | 'warn') => void
  onClose: () => void
  onSave: (r: Routine) => void
  subtitle?: string
}) {
  const [draft, setDraft] = useState<Routine | null>(() => (routine ? structuredClone(routine) : null))
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  // Día que abrió la guía de grupos musculares (null = guía cerrada).
  const [guideDay, setGuideDay] = useState<number | null>(null)

  // Los ejercicios activos de la biblioteca, para el autocompletado y el selector.
  const activeCatalog = catalog.filter((item) => !item.archived)
  // Foto en pantalla: la propia del renglón o, si no tiene, la de la biblioteca
  // (por enlace o por nombre). Así las fotos nuevas del catálogo se ven también
  // en rutinas ya creadas, sin esperar a que se guarde el renglón.
  const catalogImageFor = (ex: { name: string; imageKey?: string | null; catalogId?: string | null }) =>
    ex.imageKey ?? resolveCatalogItem(catalog, ex.name, ex.catalogId)?.imageKey ?? null

      if (!routine || !draft) return null

  const update = (patch: Partial<Routine>) => setDraft({ ...draft, ...patch })

  /** Agrega un ejercicio de la biblioteca al día; el cardio entra primero. */
  const addToDay = (item: ExerciseCatalogItem, di: number) => {
    const days = [...draft.days]
    const day = days[di]
    if (!day) return
    days[di] = {
      ...day,
      exercises: item.cardio ? [blankCardio(item), ...day.exercises] : [...day.exercises, blankExercise(item)],
    }
    update({ days })
  }
  /** True si el ejercicio ya está en el día (por enlace o por nombre). */
  const inDay = (item: ExerciseCatalogItem, di: number) =>
    draft.days[di]?.exercises.some((ex) => ex.catalogId === item.id || ex.name === item.name) ?? false

  const moveDay = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= draft.days.length) return
    const days = [...draft.days]
    const [moved] = days.splice(index, 1)
    days.splice(target, 0, moved)
    update({ days: renumberDefaultDays(days) })
  }

  const renumber = () => update({ days: renumberDefaultDays(draft.days) })

  const attachImage = async (dayIndex: number, exerciseId: string, file: File) => {
    setUploadingId(exerciseId)
    try {
      const prepared = await compressExerciseImage(file)
      const data = await apiUploadExerciseImage(prepared)
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          days: current.days.map((day, index) =>
            index !== dayIndex
              ? day
              : {
                  ...day,
                  exercises: day.exercises.map((exercise) =>
                    exercise.id === exerciseId ? { ...exercise, imageKey: data.key } : exercise,
                  ),
                },
          ),
        }
      })
      notify('Foto del ejercicio lista')
    } catch (error) {
      notify(
        error instanceof ExerciseImageError || error instanceof Error
          ? error.message
          : 'No se pudo subir la foto.',
        'warn',
      )
    } finally {
      setUploadingId(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editor de rutina"
      subtitle={subtitle}
      wide
      footer={
        <div className="flex justify-between gap-2">
          <p className="text-[11.5px] text-muted">{draft.days.length} días · {draft.days.reduce((s, d) => s + d.exercises.length, 0)} ejercicios</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={() => onSave(normalizeCardioFirst(draft))}>Guardar rutina</Button>
          </div>
        </div>
      }
    >
      <datalist id="rutina-catalogo">
        {catalog.map((item) => <option key={item.id} value={item.name} />)}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input className={inputClass} value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Objetivo">
          <select className={inputClass} value={draft.goal} onChange={(e) => update({ goal: e.target.value })}>
            {['Pérdida de grasa', 'Ganancia muscular', 'Recomposición', 'Fuerza', 'Salud general'].map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Nivel">
          <select className={inputClass} value={draft.level} onChange={(e) => update({ level: e.target.value as Routine['level'] })}>
            {['Principiante', 'Intermedio', 'Avanzado'].map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Semanas">
          <input className={inputClass} type="number" value={draft.weeks} onChange={(e) => update({ weeks: Number(e.target.value) })} />
        </Field>
      </div>

      <div className="mt-5 space-y-3">
        {draft.days.map((day, di) => (
          <div key={day.id} className="rounded-2xl border border-line p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas text-[11.5px] font-semibold text-muted">
                {di + 1}
              </span>
              <div className="flex shrink-0 flex-col">
                <button
                  onClick={() => moveDay(di, -1)}
                  disabled={di === 0}
                  className="rounded p-0.5 text-muted hover:bg-brand-soft hover:text-brand disabled:opacity-25 disabled:hover:bg-transparent"
                  aria-label={`Mover ${day.name} arriba`}
                  title="Mover arriba"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  onClick={() => moveDay(di, 1)}
                  disabled={di === draft.days.length - 1}
                  className="rounded p-0.5 text-muted hover:bg-brand-soft hover:text-brand disabled:opacity-25 disabled:hover:bg-transparent"
                  aria-label={`Mover ${day.name} abajo`}
                  title="Mover abajo"
                >
                  <ArrowDown size={12} />
                </button>
              </div>
              <input
                className={cx(inputClass, 'h-9 py-1 text-[13px] font-medium')}
                value={day.name}
                onChange={(e) => {
                  const days = [...draft.days]
                  days[di] = { ...day, name: e.target.value }
                  update({ days })
                }}
              />
              <input
                className={cx(inputClass, 'h-9 py-1 text-[13px]')}
                value={day.focus}
                placeholder="Enfoque del día"
                onChange={(e) => {
                  const days = [...draft.days]
                  days[di] = { ...day, focus: e.target.value }
                  update({ days })
                }}
              />
              <button
                onClick={() => update({ days: renumberDefaultDays(draft.days.filter((d) => d.id !== day.id)) })}
                className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"
                aria-label="Eliminar día"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Apartado Cardio: primero en el día, máquina + minutos. */}
            <div className="mt-2 rounded-xl border border-warn/30 bg-warn/[0.04] p-2.5">
              <div className="flex items-center gap-1.5 px-1">
                <HeartPulse size={13} className="text-warn" aria-hidden />
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-warn">Cardio</span>
                <span className="text-[10.5px] text-muted">al inicio del entrenamiento</span>
              </div>

              {day.exercises.some((ex) => ex.cardio) && (
                <>
                  <div className="mt-2 grid grid-cols-[1fr_72px_28px] items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                    <span>Máquina</span>
                    <span className="text-center">Minutos</span>
                    <span />
                  </div>
                  <div className="mt-1 space-y-1.5">
                    {day.exercises.filter((ex) => ex.cardio).map((ex) => (
                      <div key={ex.id} className={cx('rounded-lg', catalogImageFor(ex) && 'bg-black/[0.02] p-1')}>
                        <div className="grid grid-cols-[1fr_72px_28px] items-center gap-1.5">
                          <div className="relative">
                            <input
                              className={cx(inputClass, 'h-9 w-full py-1 pr-9 text-[12.5px]')}
                              placeholder="Máquina de cardio"
                              list="rutina-catalogo"
                              value={ex.name}
                              title={ex.catalogId ? 'Enlazada a la biblioteca' : 'Si está en la biblioteca, el cardio se guarda bien'}
                              onChange={(e) => {
                                const name = e.target.value
                                const match = catalog.find(
                                  (item) => item.name.toLowerCase() === name.trim().toLowerCase(),
                                )
                                const days = [...draft.days]
                                days[di] = {
                                  ...day,
                                  exercises: day.exercises.map((x) => (x.id === ex.id ? {
                                    ...x,
                                    name,
                                    catalogId: match?.id ?? x.catalogId ?? null,
                                    cardio: true,
                                    minutes: x.minutes ?? 20,
                                    imageKey: x.imageKey ?? match?.imageKey ?? null,
                                  } : x)),
                                }
                                update({ days })
                              }}
                            />
                            <HeartPulse
                              size={12}
                              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-warn"
                              aria-label="Ejercicio de cardio"
                            />
                          </div>
                          <input
                            className={cx(inputClass, 'h-9 px-2 py-1 text-center text-[12px]')}
                            value={ex.minutes ?? 20}
                            inputMode="numeric"
                            title="Duración del cardio en minutos"
                            aria-label={`Minutos de ${ex.name || 'cardio'}`}
                            onChange={(e) => {
                              const days = [...draft.days]
                              days[di] = {
                                ...day,
                                exercises: day.exercises.map((x) => (x.id === ex.id ? { ...x, minutes: Math.max(0, Math.min(600, Number(e.target.value) || 0)) } : x)),
                              }
                              update({ days })
                            }}
                          />
                          <button
                            onClick={() => {
                              const days = [...draft.days]
                              days[di] = { ...day, exercises: day.exercises.filter((x) => x.id !== ex.id) }
                              update({ days })
                            }}
                            className="rounded-md p-1 text-muted hover:text-danger"
                            aria-label="Quitar cardio"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {catalogImageFor(ex) && (
                          <div className="mt-1 flex items-center gap-2 px-1 pb-0.5">
                            <img
                              src={exerciseImageUrl(catalogImageFor(ex)!)}
                              alt={`Foto de ${ex.name || 'ejercicio'}`}
                              className="h-12 w-12 rounded-md border border-line object-cover"
                            />
                            {ex.imageKey && (
                            <button
                              onClick={() => {
                                const days = [...draft.days]
                                days[di] = {
                                  ...day,
                                  exercises: day.exercises.map((x) => (x.id === ex.id ? { ...x, imageKey: null } : x)),
                                }
                                update({ days })
                              }}
                              className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-medium text-muted hover:text-danger"
                            >
                              <X size={11} /> Quitar
                            </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    const days = [...draft.days]
                    days[di] = { ...day, exercises: [blankCardio(), ...day.exercises] }
                    update({ days })
                  }}
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-warn"
                >
                  <Plus size={12} /> Agregar cardio
                </button>

                {catalog.some((item) => item.cardio && !item.archived) && (
                  <label className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                    <BookOpen size={12} className="text-warn" />
                    <select
                      className={cx(selectCompact, 'h-8 py-0 text-[11.5px]')}
                      value=""
                      aria-label="Agregar máquina de cardio"
                      onChange={(e) => {
                        const item = catalog.find((entry) => entry.id === e.target.value)
                        if (!item) return
                        const days = [...draft.days]
                        days[di] = { ...day, exercises: [blankCardio(item), ...day.exercises] }
                        update({ days })
                      }}
                    >
                      <option value="">Máquina de la biblioteca…</option>
                      {catalog.filter((item) => item.cardio && !item.archived).map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_64px_44px_64px_28px_28px] items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
              <span>Ejercicio</span>
              <span className="text-center">Series</span>
              <span className="text-center">Reps</span>
              <span className="text-center">Desc. (s)</span>
              <span className="text-center">Foto</span>
              <span />
            </div>

            <div className="mt-1 space-y-1.5">
              {day.exercises.filter((ex) => !ex.cardio).map((ex) => (
                <div key={ex.id} className={cx('rounded-lg', catalogImageFor(ex) && 'bg-black/[0.02] p-1')}>
                  <div className="grid grid-cols-[1fr_64px_44px_64px_28px_28px] items-center gap-1.5">
                  <div className="relative">
                    <input
                      className={cx(inputClass, 'h-9 w-full py-1 pr-14 text-[12.5px]')}
                      placeholder="Ejercicio de la biblioteca o personalizado"
                      list="rutina-catalogo"
                      value={ex.name}
                      title={ex.cardio ? 'Cardio: se registra por minutos' : ex.catalogId ? 'Enlazado a la biblioteca' : 'Ejercicio personalizado (sin enlace)'}
                      onChange={(e) => {
                        const name = e.target.value
                        const match = catalog.find(
                          (item) => item.name.toLowerCase() === name.trim().toLowerCase(),
                        )
                        const days = [...draft.days]
                        days[di] = {
                          ...day,
                          exercises: day.exercises.map((x) => (x.id === ex.id ? {
                            ...x,
                            name,
                            catalogId: match?.id ?? null,
                            cardio: match?.cardio ?? false,
                            minutes: match?.cardio ? (x.minutes ?? 20) : null,
                            imageKey: x.imageKey ?? match?.imageKey ?? null,
                          } : x)),
                        }
                        update({ days })
                      }}
                    />
                    {ex.cardio && (
                      <HeartPulse
                        size={12}
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-warn"
                        aria-label="Ejercicio de cardio"
                      />
                    )}
                    {!ex.cardio && ex.catalogId && (
                      <BookOpen
                        size={12}
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-brand"
                        aria-label="Enlazado a la biblioteca"
                      />
                    )}
                  </div>
                  <>
                      <input
                        className={cx(inputClass, 'h-9 px-2 py-1 text-center text-[12px]')}
                        value={ex.sets}
                        inputMode="numeric"
                        onChange={(e) => {
                          const days = [...draft.days]
                          days[di] = {
                            ...day,
                            exercises: day.exercises.map((x) => (x.id === ex.id ? { ...x, sets: Number(e.target.value) } : x)),
                          }
                          update({ days })
                        }}
                      />
                      <input
                        className={cx(inputClass, 'h-9 px-2 py-1 text-center text-[12px]')}
                        value={ex.reps}
                        onChange={(e) => {
                          const days = [...draft.days]
                          days[di] = {
                            ...day,
                            exercises: day.exercises.map((x) => (x.id === ex.id ? { ...x, reps: e.target.value } : x)),
                          }
                          update({ days })
                        }}
                      />
                      <input
                        className={cx(inputClass, 'h-9 px-2 py-1 text-center text-[12px]')}
                        type="number"
                        min={0}
                        max={3600}
                        value={ex.restSeconds ?? (Number.parseInt(ex.rest, 10) || 60)}
                        onChange={(e) => {
                          const seconds = Math.max(0, Math.min(3600, Number(e.target.value) || 0))
                          const days = [...draft.days]
                          days[di] = {
                            ...day,
                            exercises: day.exercises.map((x) => (x.id === ex.id ? { ...x, restSeconds: seconds, rest: `${seconds} s` } : x)),
                          }
                          update({ days })
                        }}
                      />
                    </>
                  <label
                    className="grid h-9 cursor-pointer place-items-center rounded-md text-muted hover:bg-brand-soft hover:text-brand"
                    title={ex.imageKey ? 'Cambiar foto del ejercicio' : catalogImageFor(ex) ? 'Foto de la biblioteca · agregar foto propia' : 'Agregar foto del ejercicio'}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.currentTarget.value = ''
                        if (file) void attachImage(di, ex.id, file)
                      }}
                    />
                    {uploadingId === ex.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <ImagePlus size={13} />}
                  </label>
                  <button
                    onClick={() => {
                      const days = [...draft.days]
                      days[di] = { ...day, exercises: day.exercises.filter((x) => x.id !== ex.id) }
                      update({ days })
                    }}
                    className="rounded-md p-1 text-muted hover:text-danger"
                    aria-label="Quitar ejercicio"
                  >
                    <Trash2 size={13} />
                  </button>
                  </div>
                  {catalogImageFor(ex) && (
                    <div className="mt-1 flex items-center gap-2 px-1 pb-0.5">
                      <img
                        src={exerciseImageUrl(catalogImageFor(ex)!)}
                        alt={`Foto de ${ex.name || 'ejercicio'}`}
                        className="h-12 w-12 rounded-md border border-line object-cover"
                      />
                      <span className="text-[10.5px] text-muted">{ex.imageKey ? 'Así lo verá el cliente' : 'Foto de la biblioteca · así lo verá el cliente'}</span>
                      {ex.imageKey && (
                      <button
                        onClick={() => {
                          const days = [...draft.days]
                          days[di] = {
                            ...day,
                            exercises: day.exercises.map((x) => (x.id === ex.id ? { ...x, imageKey: null } : x)),
                          }
                          update({ days })
                        }}
                        className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-medium text-muted hover:text-danger"
                      >
                        <X size={11} /> Quitar
                      </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  const days = [...draft.days]
                  days[di] = { ...day, exercises: [...day.exercises, blankExercise()] }
                  update({ days })
                }}
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand"
              >
                <Plus size={12} /> Agregar ejercicio
              </button>

              <label className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                <BookOpen size={12} className="text-brand" />
                <select
                  className={cx(selectCompact, 'h-8 py-0 text-[11.5px]')}
                  value=""
                  aria-label="Agregar desde biblioteca"
                  onChange={(e) => {
                    const item = catalog.find((entry) => entry.id === e.target.value)
                    if (!item) return
                    const days = [...draft.days]
                    // El cardio entra al inicio del día; la fuerza se agrega al final.
                    days[di] = {
                      ...day,
                      exercises: item.cardio ? [blankCardio(item), ...day.exercises] : [...day.exercises, blankExercise(item)],
                    }
                    update({ days })
                  }}
                >
                  <option value="">Agregar desde biblioteca…</option>
                  {/* Agrupado por grupo muscular, la misma lista que ordena Ejercicios. */}
                  {groupByMuscle(activeCatalog, true).map(([label, items]) => (
                    <optgroup key={label} label={label}>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.cardio ? ' — cardio' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <button
                onClick={() => setGuideDay(di)}
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand"
                title="Qué cubre cada grupo y ejercicios de tu biblioteca"
              >
                <Lightbulb size={12} /> Guía de grupos
              </button>

              {catalog.length === 0 && (
                <span className="text-[11px] text-muted">
                  La biblioteca está vacía; crea ejercicios en <strong>Ejercicios</strong>.
                </span>
              )}
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => update({ days: [...draft.days, blankDay(draft.days.length + 1)] })}>
            <Dumbbell size={14} /> Agregar día
          </Button>
          <Button variant="secondary" size="sm" onClick={renumber}>
            Renumerar días
          </Button>
          <span className="text-[11px] text-muted">
            Usa las flechas para mover un día; los nombres «Día N» se ajustan al orden.
          </span>
        </div>
      </div>

      <MuscleGroupGuide
        open={guideDay !== null}
        onClose={() => setGuideDay(null)}
        catalog={activeCatalog}
        dayName={draft.days[guideDay ?? 0]?.name ?? 'el día'}
        onPick={(item) => { if (guideDay !== null) addToDay(item, guideDay) }}
        isAdded={(item) => guideDay !== null && inDay(item, guideDay)}
      />
    </Modal>
  )
}
