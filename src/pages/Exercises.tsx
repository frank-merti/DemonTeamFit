import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Dumbbell, ImagePlus, Pencil, Plus, RotateCcw, Search, Trash2, UserCheck, X } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { useScopedClients } from '../lib/hooks'
import {
  apiArchiveExercise, apiCreateExercise, apiExercises, apiRecommendExercise,
  apiRestoreExercise, apiUpdateExercise, apiUploadExerciseImage, exerciseImageUrl,
} from '../lib/api'
import { compressExerciseImage, ExerciseImageError } from '../lib/image'
import { MUSCLE_GROUPS, groupByMuscle, groupLabelOf } from '../lib/muscles'
import type { ExerciseCatalogItem } from '../types'
import {
  Badge, Button, Card, EmptyState, Field, Modal, PageHeader, SearchInput, cx, inputClass,
} from '../components/ui'

type Draft = {
  name: string
  muscleGroup: string
  equipment: string
  instructions: string
  cardio: boolean
  imageKey: string | null
}

const EMPTY_DRAFT: Draft = { name: '', muscleGroup: '', equipment: '', instructions: '', cardio: false, imageKey: null }

export default function Exercises() {
  const { notify, routines } = useApp()
  const clients = useScopedClients().filter((client) => !client.archived)
  const [clientId, setClientId] = useState('')
  const activeClientId = clientId || clients[0]?.id || ''
  const [exercises, setExercises] = useState<ExerciseCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ExerciseCatalogItem | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiExercises(activeClientId || undefined, showArchived)
      setExercises(data.exercises)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo cargar la biblioteca.', 'warn')
    } finally {
      setLoading(false)
    }
  }, [activeClientId, showArchived, notify])

  useEffect(() => {
    void load()
  }, [load])

  const selectedClient = clients.find((client) => client.id === activeClientId)
  const assignedRoutine = selectedClient?.routineId
    ? routines.find((routine) => routine.id === selectedClient.routineId)
    : undefined
  const groups = useMemo(
    () => [...new Set(exercises.map((exercise) => groupLabelOf(exercise.muscleGroup)))].sort(),
    [exercises],
  )
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return exercises.filter((exercise) => {
      const matchesQuery = !needle ||
        exercise.name.toLowerCase().includes(needle) ||
        exercise.muscleGroup.toLowerCase().includes(needle) ||
        exercise.equipment.toLowerCase().includes(needle)
      const matchesGroup = !group || groupLabelOf(exercise.muscleGroup) === group
      return matchesQuery && matchesGroup
    })
  }, [exercises, query, group])
  // Biblioteca por secciones de grupo muscular (la misma lista que agrupa
  // el selector de rutinas).
  const grouped = useMemo(() => groupByMuscle(filtered), [filtered])

  const recommendedCount = exercises.filter((exercise) => exercise.recommended && !exercise.archived).length

  const openNew = () => {
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setFormError('')
    setEditorOpen(true)
  }

  const openEdit = (exercise: ExerciseCatalogItem) => {
    setEditing(exercise)
    setDraft({
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
      instructions: exercise.instructions,
      cardio: exercise.cardio,
      imageKey: exercise.imageKey ?? null,
    })
    setFormError('')
    setEditorOpen(true)
  }

  const save = async () => {
    if (!draft.name.trim()) {
      setFormError('El nombre del ejercicio es obligatorio.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        await apiUpdateExercise(editing.id, draft)
        notify('Ejercicio actualizado')
      } else {
        await apiCreateExercise(draft)
        notify('Ejercicio agregado a la biblioteca')
      }
      setEditorOpen(false)
      await load()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar el ejercicio.')
    } finally {
      setSaving(false)
    }
  }

  const toggleRecommendation = async (exercise: ExerciseCatalogItem) => {
    if (!activeClientId || !selectedClient) return
    setBusyId(exercise.id)
    try {
      const next = !exercise.recommended
      await apiRecommendExercise(exercise.id, activeClientId, next)
      setExercises((current) =>
        current.map((item) => (item.id === exercise.id ? { ...item, recommended: next } : item)),
      )
      notify(next
        ? `«${exercise.name}» recomendado a ${selectedClient.name.split(' ')[0]}`
        : `«${exercise.name}» ya no está recomendado`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo actualizar la recomendación.', 'warn')
    } finally {
      setBusyId('')
    }
  }

  const attachImage = async (file: File) => {
    setFormError('')
    try {
      const prepared = await compressExerciseImage(file)
      const data = await apiUploadExerciseImage(prepared)
      setDraft((current) => ({ ...current, imageKey: data.key }))
      notify('Imagen del ejercicio lista')
    } catch (error) {
      setFormError(error instanceof ExerciseImageError || error instanceof Error ? error.message : 'No se pudo subir la imagen.')
    }
  }

  const removeImage = () => {
    if (draft.imageKey) setDraft({ ...draft, imageKey: null })
  }

  const archive = async (exercise: ExerciseCatalogItem) => {
    if (!window.confirm(`¿Archivar «${exercise.name}»? Dejará de aparecer en la biblioteca activa.`)) return
    setBusyId(exercise.id)
    try {
      await apiArchiveExercise(exercise.id)
      await load()
      notify('Ejercicio archivado')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo archivar el ejercicio.', 'warn')
    } finally {
      setBusyId('')
    }
  }

  const restore = async (exercise: ExerciseCatalogItem) => {
    setBusyId(exercise.id)
    try {
      await apiRestoreExercise(exercise.id)
      await load()
      notify('Ejercicio restaurado')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo restaurar el ejercicio.', 'warn')
    } finally {
      setBusyId('')
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Programación"
        title="Ejercicios"
        subtitle="La biblioteca del coach. Marca con un checkbox los ejercicios recomendados para cada cliente."
        actions={<Button onClick={openNew}><Plus size={16} /> Nuevo ejercicio</Button>}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card>
          <div className="border-b border-line p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-soft text-brand-dark">
                  <BookOpen size={17} />
                </span>
                <div>
                  <p className="text-[14px] font-semibold">Biblioteca de ejercicios</p>
                  <p className="text-[11.5px] text-muted">
                    {exercises.length} ejercicios · {recommendedCount} recomendados
                    {selectedClient ? ` a ${selectedClient.name.split(' ')[0]}` : ''}
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line accent-[var(--color-brand)]"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                Ver archivados
              </label>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px]">
              <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, grupo o equipo" />
              <select className={inputClass} value={group} onChange={(event) => setGroup(event.target.value)}>
                <option value="">Todos los grupos</option>
                {groups.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="px-4 py-12 text-center text-[13px] text-muted">Cargando biblioteca…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Sin ejercicios"
              description={query || group
                ? 'No hay ejercicios que coincidan con el filtro.'
                : 'Agrega el primer ejercicio a la biblioteca del coach.'}
              action={<Button size="sm" onClick={openNew}><Plus size={14} /> Nuevo ejercicio</Button>}
            />
          ) : (
            <div className="divide-y divide-line">
              {grouped.map(([label, items]) => (
                <section key={label}>
                  <header className="flex items-center justify-between gap-2 bg-canvas/70 px-4 py-1.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
                    <span className="text-[10.5px] text-muted">{items.length}</span>
                  </header>
                  {items.map((exercise) => (
                <div
                  key={exercise.id}
                  className={cx('flex items-start gap-3 px-4 py-3', exercise.archived && 'bg-canvas/50 opacity-70')}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-line accent-[var(--color-brand)] disabled:opacity-40"
                    checked={exercise.recommended}
                    disabled={!activeClientId || exercise.archived || busyId === exercise.id}
                    onChange={() => void toggleRecommendation(exercise)}
                    aria-label={selectedClient
                      ? `Recomendar ${exercise.name} a ${selectedClient.name}`
                      : `Recomendar ${exercise.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[13.5px] font-semibold leading-tight">{exercise.name}</p>
                      {exercise.muscleGroup && <Badge tone="brand">{exercise.muscleGroup}</Badge>}
                      {exercise.cardio && <Badge tone="warn">Cardio</Badge>}
                      {exercise.equipment && <span className="text-[11px] text-muted">{exercise.equipment}</span>}
                      {exercise.archived && <Badge tone="neutral">Archivado</Badge>}
                    </div>
                    <div className="mt-1 flex items-start gap-2">
                      {exercise.imageKey && (
                        <img
                          src={exerciseImageUrl(exercise.imageKey)}
                          alt={`Foto de ${exercise.name}`}
                          className="h-12 w-12 shrink-0 rounded-md border border-line object-cover"
                        />
                      )}
                      {exercise.instructions && (
                        <p className="line-clamp-2 min-w-0 text-[12px] leading-relaxed text-muted">{exercise.instructions}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => openEdit(exercise)}
                      className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink"
                      aria-label={`Editar ${exercise.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    {exercise.archived ? (
                      <button
                        onClick={() => void restore(exercise)}
                        disabled={busyId === exercise.id}
                        className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink disabled:opacity-40"
                        aria-label={`Restaurar ${exercise.name}`}
                      >
                        <RotateCcw size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => void archive(exercise)}
                        disabled={busyId === exercise.id}
                        className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                        aria-label={`Archivar ${exercise.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
                </section>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-soft text-brand-dark">
                <UserCheck size={16} />
              </span>
              <div>
                <p className="text-[13.5px] font-semibold">Recomendar a un cliente</p>
                <p className="text-[11px] text-muted">El checkbox no arma la rutina</p>
              </div>
            </div>
            <Field label="Cliente" className="mt-3">
              <select className={inputClass} value={activeClientId} onChange={(event) => setClientId(event.target.value)}>
                {clients.length === 0 && <option value="">Sin clientes activos</option>}
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </Field>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Marca los ejercicios que quieres recomendar. El cliente los verá en su biblioteca;
              la rutina se sigue editando aparte, en <strong>Rutinas</strong>.
            </p>
            {selectedClient && (
              <div className="mt-3 rounded-xl bg-canvas px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Recomendados</p>
                <p className="mt-0.5 text-[20px] font-semibold leading-none">{recommendedCount}</p>
                <p className="mt-1 text-[11px] text-muted">para {selectedClient.name}</p>
              </div>
            )}

            {selectedClient && (
              <div className="mt-3 rounded-xl border border-line px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted">
                  <Dumbbell size={11} /> Rutina asignada
                </p>
                {assignedRoutine ? (
                  <>
                    <p className="mt-1 text-[12.5px] font-semibold leading-tight">{assignedRoutine.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {assignedRoutine.days.length} días · {assignedRoutine.days.reduce((sum, day) => sum + day.exercises.length, 0)} ejercicios
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[11.5px] text-muted">Todavía no tiene una rutina asignada.</p>
                )}
                <Link
                  to={`/clientes/${selectedClient.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:text-brand-dark"
                >
                  Abrir ficha y editar rutina →
                </Link>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-2 text-[12.5px] font-semibold">
              <Search size={14} className="text-brand" /> Cómo funciona
            </p>
            <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-muted">
              <li>• La biblioteca es compartida por coach y admin.</li>
              <li>• Cada ejercicio puede llevar una <strong>imagen</strong>: viaja a la rutina de cada cliente al agregarlo.</li>
              <li>• Los ejercicios de <strong>cardio</strong> se programan por minutos; la máquina va en el nombre o el equipo.</li>
              <li>• Archivar no borra el historial de cargas ni el feedback.</li>
              <li>• Las recomendaciones son por cliente y se pueden quitar en cualquier momento.</li>
              <li>• Para que un ejercicio llegue al cliente, agrégalo a su rutina desde <strong>Rutinas</strong> usando el catálogo.</li>
              <li>• El descanso se define al editar cada ejercicio dentro de la rutina.</li>
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
        subtitle={editing ? editing.name : 'Se agrega a la biblioteca del coach'}
        footer={
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-danger">{formError}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditorOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar ejercicio'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2">
            <input
              className={inputClass}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Ej. Sentadilla con barra"
              autoFocus
            />
          </Field>
          <Field label="Grupo muscular">
            <select
              className={inputClass}
              value={draft.muscleGroup}
              onChange={(event) => setDraft({ ...draft, muscleGroup: event.target.value })}
            >
              <option value="">Sin categoría</option>
              {MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
              {/* Valor heredado no canónico: se conserva hasta que el coach lo reasigne. */}
              {draft.muscleGroup && !MUSCLE_GROUPS.includes(draft.muscleGroup as (typeof MUSCLE_GROUPS)[number]) && (
                <option value={draft.muscleGroup}>{draft.muscleGroup}</option>
              )}
            </select>
          </Field>
          <Field label="Tipo">
            <select
              className={inputClass}
              value={draft.cardio ? 'cardio' : 'fuerza'}
              onChange={(event) => setDraft({ ...draft, cardio: event.target.value === 'cardio' })}
            >
              <option value="fuerza">Fuerza (series y repeticiones)</option>
              <option value="cardio">Cardio (por minutos en la rutina)</option>
            </select>
          </Field>
          <Field label="Equipo">
            <input
              className={inputClass}
              value={draft.equipment}
              onChange={(event) => setDraft({ ...draft, equipment: event.target.value })}
              placeholder="Ej. Barra, caminadora, elíptica"
            />
          </Field>
          <Field label="Instrucciones o técnica" className="sm:col-span-2">
            <textarea
              className={cx(inputClass, 'min-h-[96px] resize-y')}
              value={draft.instructions}
              onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
              placeholder="Notas breves de ejecución para el coach"
            />
          </Field>
          <Field label="Imagen del ejercicio" className="sm:col-span-2">
            {draft.imageKey ? (
              <div className="flex items-center gap-2">
                <img
                  src={exerciseImageUrl(draft.imageKey)}
                  alt="Imagen del ejercicio"
                  className="h-16 w-16 rounded-lg border border-line object-cover"
                />
                <span className="text-[11.5px] text-muted">Viajará con el ejercicio a cada rutina</span>
                <button
                  onClick={removeImage}
                  className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-muted hover:text-danger"
                >
                  <X size={12} /> Quitar
                </button>
              </div>
            ) : (
              <label
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-[12px] text-muted hover:border-brand/40 hover:text-brand"
                title="Subir imagen del ejercicio"
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.currentTarget.value = ''
                    if (file) void attachImage(file)
                  }}
                />
                <ImagePlus size={14} /> Subir imagen o GIF corto (JPG, PNG, WebP, GIF)
              </label>
            )}
          </Field>
        </div>
      </Modal>
    </>
  )
}
