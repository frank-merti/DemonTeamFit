import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Copy, Pencil, Plus, Trash2, Upload, UserPlus } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { useScopedClients } from '../lib/hooks'
import { apiExercises, exerciseImageUrl } from '../lib/api'
import { fmtDate, avatarColor, todayISO } from '../lib/format'
import { resolveCatalogItem } from '../lib/catalog'
import { hasFoodPlan, hasFullAnthro, ONE_PLAN_MESSAGE } from '../lib/plans'
import ImportRoutineModal from '../components/ImportRoutineModal'
import RoutineEditor, { blankDay, uid } from '../components/RoutineEditor'
import type { ExerciseCatalogItem, Routine } from '../types'
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, Modal, PageHeader, SearchInput, cx,
} from '../components/ui'

export default function Routines() {
  const { routines, saveRoutine, deleteRoutine, assignRoutine, unassignRoutine, clearFoodPlan, viewRole, notify } = useApp()
  const clients = useScopedClients()
  // La página solo lista plantillas; las copias personalizadas viven en la ficha
  // del cliente para no duplicar la biblioteca de rutinas.
  const templates = useMemo(() => routines.filter((r) => !r.clientId), [routines])
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<Routine | null>(null)
  const [assignTo, setAssignTo] = useState<Routine | null>(null)
  const [assignQuery, setAssignQuery] = useState('')
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([])
  const [importOpen, setImportOpen] = useState(false)

  // El catálogo se carga una vez: el editor lo usa para enlazar cada ejercicio
  // de la rutina con la biblioteca y evitar nombres escritos a mano.
  useEffect(() => {
    let alive = true
    void apiExercises()
      .then((data) => {
        if (alive) setCatalog(data.exercises.filter((exercise) => !exercise.archived))
      })
      .catch(() => {
        if (alive) setCatalog([])
      })
    return () => {
      alive = false
    }
  }, [])

  // Foto en pantalla: la propia del renglón o, si no tiene, la de la biblioteca
  // (por enlace o por nombre) — así las fotos nuevas del catálogo se reflejan
  // en rutinas ya creadas.
  const catalogImageFor = (ex: { name: string; imageKey?: string | null; catalogId?: string | null }) =>
    ex.imageKey ?? resolveCatalogItem(catalog, ex.name, ex.catalogId)?.imageKey ?? null

  const selected = templates.find((r) => r.id === selectedId) ?? templates[0]
  const filtered = useMemo(
    () => templates.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()) || r.goal.toLowerCase().includes(query.toLowerCase())),
    [templates, query],
  )

  const newRoutine = () => {
    const routine: Routine = {
      id: uid('r'),
      name: 'Nueva rutina',
      goal: 'Salud general',
      level: 'Principiante',
      weeks: 4,
      assignedTo: [],
      updatedAt: todayISO(),
      days: [blankDay(1)],
    }
    setEditor(routine)
  }

  const duplicate = async (r: Routine) => {
    const copy: Routine = { ...r, id: uid('r'), name: `${r.name} (copia)`, assignedTo: [], days: r.days.map((d) => ({ ...d, id: uid('day'), exercises: d.exercises.map((e) => ({ ...e, id: uid('ex') })) })) }
    const res = await saveRoutine(copy)
    if (!res.ok) { notify(res.error ?? 'No se pudo duplicar', 'warn'); return }
    setSelectedId(copy.id)
    notify('Rutina duplicada')
  }

  const removeRoutine = async (r: Routine) => {
    const exerciseCount = r.days.reduce((sum, day) => sum + day.exercises.length, 0)
    const photoCount = r.days.reduce(
      (sum, day) => sum + day.exercises.filter((exercise) => exercise.imageKey).length,
      0,
    )
    const assigned = r.assignedTo.length
    const ok = window.confirm(
      `¿Eliminar «${r.name}» definitivamente?\n\n` +
      `Se borrarán ${r.days.length} días, ${exerciseCount} ejercicios y ${photoCount} foto(s).` +
      (assigned > 0 ? `\n${assigned} cliente(s) quedarán sin rutina.` : '') +
      '\n\nEl historial de cargas se conserva. Esta acción no se puede deshacer.',
    )
    if (!ok) return
    const remaining = templates.filter((item) => item.id !== r.id)
    const res = await deleteRoutine(r.id)
    if (!res.ok) { notify(res.error ?? 'No se pudo eliminar la rutina', 'warn'); return }
    if (selectedId === r.id) setSelectedId(remaining[0]?.id ?? '')
    setQuery('')
    notify(`Rutina «${r.name}» eliminada`)
  }

  return (
    <>
      <PageHeader
        eyebrow="Programación"
        title="Rutinas"
        subtitle="Plantillas reutilizables. Editar una plantilla actualiza a todos los clientes asignados."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={16} /> Importar
            </Button>
            <Button onClick={newRoutine}><Plus size={16} /> Nueva rutina</Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div>
          <div className="mb-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar rutina u objetivo" />
          </div>
          <div className="space-y-2">
            {filtered.map((r) => (
              <div
                key={r.id}
                className={cx(
                  'group relative rounded-2xl border bg-surface transition-all',
                  selected?.id === r.id ? 'border-brand ring-2 ring-brand/10' : 'border-line hover:border-brand/40',
                )}
              >
                <button
                  onClick={() => setSelectedId(r.id)}
                  className="w-full p-4 pr-11 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13.5px] font-semibold leading-tight">{r.name}</p>
                    <Badge tone="neutral">{r.level}</Badge>
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted">{r.days.length} días · {r.weeks} semanas · {r.goal}</p>
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted">
                    <UserPlus size={12} /> {r.assignedTo.length} asignados
                    <span className="mx-1 text-line">·</span>
                    <span>Editada {fmtDate(r.updatedAt)}</span>
                  </div>
                </button>
                {viewRole === 'admin' && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void removeRoutine(r)
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    title={`Eliminar rutina «${r.name}»`}
                    aria-label={`Eliminar rutina ${r.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <Card>
                <EmptyState
                  title={templates.length === 0 ? 'Sin rutinas' : 'Sin resultados'}
                  description={
                    templates.length === 0
                      ? 'Crea la primera plantilla para tus clientes.'
                      : 'Prueba con otro nombre u objetivo.'
                  }
                  action={templates.length === 0 ? <Button size="sm" onClick={newRoutine}>Nueva rutina</Button> : undefined}
                />
              </Card>
            )}
          </div>
        </div>

        {selected ? (
          <div className="space-y-4">
            <Card>
              <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[18px] font-semibold tracking-tight">{selected.name}</h2>
                    <Badge tone="brand">{selected.goal}</Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted">
                    {selected.days.length} días de entrenamiento · {selected.weeks} semanas · {selected.level}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditor(structuredClone(selected))}>
                    <Pencil size={14} /> Editar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => duplicate(selected)}>
                    <Copy size={14} /> Duplicar
                  </Button>
                  <Button size="sm" onClick={() => setAssignTo(selected)}>
                    <UserPlus size={14} /> Asignar
                  </Button>
                  {viewRole === 'admin' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-danger hover:bg-danger-soft hover:text-danger"
                      onClick={() => void removeRoutine(selected)}
                      title="Eliminar rutina"
                      aria-label="Eliminar rutina"
                    >
                      <Trash2 size={15} />
                    </Button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-line">
                {selected.days.map((day) => (
                  <div key={day.id} className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-semibold">{day.name}</p>
                        <p className="text-[11.5px] text-muted">{day.focus || 'Sin enfoque definido'}</p>
                      </div>
                      <span className="text-[11px] font-medium text-muted">{day.exercises.length} ejercicios</span>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {day.exercises.map((ex) => {
                        const imageKey = catalogImageFor(ex)
                        return (
                        <div key={ex.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            {imageKey ? (
                              <img
                                src={exerciseImageUrl(imageKey)}
                                alt={`Foto de ${ex.name || 'ejercicio'}`}
                                className="h-8 w-8 shrink-0 rounded-md border border-line object-cover"
                              />
                            ) : (
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface text-[10px] font-semibold text-muted">
                                {String(day.exercises.indexOf(ex) + 1).padStart(2, '0')}
                              </span>
                            )}
                            <p className="truncate text-[12.5px] font-medium">{ex.name || 'Ejercicio sin nombre'}</p>
                            {ex.catalogId && (
                              <BookOpen
                                size={12}
                                className="shrink-0 text-brand"
                                aria-label="Enlazado a la biblioteca"
                              />
                            )}
                          </div>
                          <p className="shrink-0 text-[11.5px] text-muted">{ex.sets} × {ex.reps} · {ex.rest}</p>
                        </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title={`Clientes con esta rutina (${selected.assignedTo.length})`} subtitle="Al editar la plantilla, todos reciben el cambio" />
              <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
                {selected.assignedTo.map((id) => {
                  const c = clients.find((x) => x.id === id)
                  if (!c) return null
                  return (
                    <div key={id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                      <Avatar name={c.name} color={avatarColor(c.id)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">{c.name}</p>
                        <p className="text-[10.5px] text-muted">{c.goal}</p>
                      </div>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`¿Quitar «${selected.name}» a ${c.name}? El cliente quedará sin rutina hasta que le asignes otra.`)) return
                          await unassignRoutine(c.id)
                          notify(`Rutina quitada a ${c.name.split(' ')[0]}`)
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[10.5px] font-medium text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
                        title="Quitar rutina al cliente"
                        aria-label={`Quitar rutina a ${c.name}`}
                      >
                        <Trash2 size={12} /> Quitar
                      </button>
                    </div>
                  )
                })}
                {selected.assignedTo.length === 0 && <p className="px-1 pb-2 text-[12px] text-muted">Aún no hay clientes asignados.</p>}
              </div>
            </Card>
          </div>
        ) : (
          <Card>
            <EmptyState
              title={templates.length === 0 ? 'Empieza con tu primera rutina' : 'Selecciona una rutina'}
              description={
                templates.length === 0
                  ? 'Crea una plantilla con sus días, ejercicios y fotos para asignarla a tus clientes.'
                  : 'Elige una plantilla de la lista para ver su contenido.'
              }
              action={
                templates.length === 0
                  ? <Button size="sm" onClick={newRoutine}><Plus size={14} /> Nueva rutina</Button>
                  : undefined
              }
            />
          </Card>
        )}
      </div>

      {importOpen && (
        <ImportRoutineModal
          open
          onClose={() => setImportOpen(false)}
          catalog={catalog}
          onSave={saveRoutine}
          onSaved={(routine) => {
            setSelectedId(routine.id)
            notify(`Rutina «${routine.name}» importada`)
          }}
        />
      )}

      <RoutineEditor
        key={editor?.id ?? 'sin-rutina'}
        routine={editor}
        catalog={catalog}
        notify={notify}
        onClose={() => setEditor(null)}
        onSave={async (r) => {
          const res = await saveRoutine({ ...r, updatedAt: new Date().toISOString().slice(0, 10) })
          if (!res.ok) { notify(res.error ?? 'No se pudo guardar', 'warn'); return }
          setSelectedId(r.id)
          setEditor(null)
          notify('Rutina guardada')
        }}
      />

      <Modal
        open={Boolean(assignTo)}
        onClose={() => setAssignTo(null)}
        title="Asignar rutina"
        subtitle={assignTo?.name}
        footer={
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => setAssignTo(null)}>Listo</Button>
          </div>
        }
      >
        <p className="mb-3 rounded-xl bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-muted">
          Asignar una rutina reemplaza la anterior del cliente. Quitarla lo deja sin
          plan de entrenamiento hasta que le asignes otra.
        </p>
        <p className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn">
          {ONE_PLAN_MESSAGE}
        </p>
        <div className="mb-3">
          <SearchInput value={assignQuery} onChange={setAssignQuery} placeholder="Buscar cliente" />
        </div>
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {clients
            .filter((c) => !c.archived && c.name.toLowerCase().includes(assignQuery.toLowerCase()))
            .map((c) => {
              const live = templates.find((r) => r.id === assignTo?.id) ?? assignTo
              const assigned = Boolean(live?.assignedTo.includes(c.id))
              const current = routines.find((r) => r.id === c.routineId)
              // Regla del plan Básico: al asignar rutina a quien ya tiene plan
              // de alimentación, el coach lo reemplaza en un paso confirmado.
              const conflict = !assigned && !hasFullAnthro(c) && hasFoodPlan(c)
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5"
                >
                  <Avatar name={c.name} color={avatarColor(c.id)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{c.name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {assigned
                        ? 'Esta rutina está asignada'
                        : current
                          ? `Rutina actual: ${current.name}`
                          : 'Sin rutina asignada'}
                    </p>
                    {conflict && (
                      <p className="mt-1 rounded-lg bg-warn-soft px-2 py-1 text-[10.5px] leading-snug text-warn">
                        Plan Básico: solo un apartado. Al asignar se quita su plan de alimentación.
                      </p>
                    )}
                  </div>
                  {assigned ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Quitar rutina a ${c.name}`}
                      onClick={async () => {
                        await unassignRoutine(c.id)
                        notify(`Rutina quitada a ${c.name.split(' ')[0]}`)
                      }}
                    >
                      <Trash2 size={13} /> Quitar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      aria-label={`Asignar rutina a ${c.name}`}
                      onClick={async () => {
                        if (!assignTo) return
                        if (conflict && !window.confirm(`Plan Básico: ${c.name} ya tiene plan de alimentación. ¿Quitarlo y asignar esta rutina?`)) return
                        if (conflict) {
                          const ok = await clearFoodPlan(c.id)
                          if (!ok) return
                        }
                        await assignRoutine(assignTo.id, c.id)
                        notify(
                          conflict
                            ? `Plan de alimentación quitado · rutina asignada a ${c.name.split(' ')[0]}`
                            : current
                              ? `Rutina cambiada a ${c.name.split(' ')[0]}`
                              : `Rutina asignada a ${c.name.split(' ')[0]}`,
                        )
                      }}
                    >
                      <UserPlus size={13} /> {conflict ? 'Reemplazar plan' : current ? 'Cambiar' : 'Asignar'}
                    </Button>
                  )}
                </div>
              )
            })}
        </div>
      </Modal>
    </>
  )
}
