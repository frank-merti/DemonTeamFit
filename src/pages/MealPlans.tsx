import { useMemo, useState } from 'react'
import { Copy, Pencil, Plus, Printer, Trash2, UserPlus, UtensilsCrossed } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { useScopedClients } from '../lib/hooks'
import { avatarColor, fmtDate, todayISO } from '../lib/format'
import { hasFullAnthro } from '../lib/plans'
import { Dietocalculo } from '../components/Dietocalculo'
import type { MealPlan } from '../types'
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, SearchInput, cx, inputClass,
} from '../components/ui'

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 5)}`

export default function MealPlans() {
  const { mealPlans, saveMealPlan, deleteMealPlan, assignMealPlan, unassignRoutine, notify } = useApp()
  const clients = useScopedClients()
  const [selectedId, setSelectedId] = useState(mealPlans[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<MealPlan | null>(null)
  const [assignTo, setAssignTo] = useState<MealPlan | null>(null)

  const selected = mealPlans.find((p) => p.id === selectedId) ?? mealPlans[0]
  const filtered = useMemo(
    () => mealPlans.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [mealPlans, query],
  )

  const newPlan = () => {
    setEditor({
      id: uid('m'),
      name: 'Nuevo plan',
      kcal: 1800,
      protein: 130,
      carbs: 190,
      fat: 55,
      assignedTo: [],
      updatedAt: todayISO(),
      meals: [
        { id: uid('meal'), slot: 'Desayuno', items: [{ id: uid('i'), food: '', qty: '' }] },
        { id: uid('meal'), slot: 'Comida', items: [{ id: uid('i'), food: '', qty: '' }] },
        { id: uid('meal'), slot: 'Cena', items: [{ id: uid('i'), food: '', qty: '' }] },
      ],
    })
  }

  const duplicate = async (p: MealPlan) => {
    const copy: MealPlan = {
      ...p, id: uid('m'), name: `${p.name} (copia)`, assignedTo: [],
      meals: p.meals.map((m) => ({ ...m, id: uid('meal'), items: m.items.map((i) => ({ ...i, id: uid('i') })) })),
    }
    const res = await saveMealPlan(copy)
    if (!res.ok) { notify(res.error ?? 'No se pudo duplicar', 'warn'); return }
    setSelectedId(copy.id)
    notify('Plan duplicado')
  }

  /* 0.27.9: eliminar el plan. Los clientes asignados quedan «sin plan»; su
     plan en PDF (si tienen) no se toca. */
  const remove = async (p: MealPlan) => {
    const count = p.assignedTo.length
    const warning = count > 0
      ? ` ${count} cliente(s) quedarán sin plan; su plan en PDF (si tienen) no se toca.`
      : ''
    if (!window.confirm(`¿Eliminar el plan «${p.name}»?${warning}`)) return
    const res = await deleteMealPlan(p.id)
    if (!res.ok) { notify(res.error ?? 'No se pudo eliminar el plan', 'warn'); return }
    setSelectedId('')
  }

  return (
    <>
      <PageHeader
        eyebrow="Nutrición"
        title="Planes de alimentación"
        subtitle="Plantillas con macros y tiempos de comida. Se comparten por PDF o WhatsApp."
        actions={<Button onClick={newPlan}><Plus size={16} /> Nuevo plan</Button>}
      />

      {/* Dietocálculo (0.27.4): raciones por grupo de alimentos con
          adecuación por macro. Herramienta del coach para clientes VIP. */}
      <div className="mb-4">
        <Dietocalculo />
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div>
          <div className="mb-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar plan" />
          </div>
          <div className="space-y-2">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cx(
                  'w-full rounded-2xl border bg-surface p-4 text-left transition-all',
                  selected?.id === p.id ? 'border-brand ring-2 ring-brand/10' : 'border-line hover:border-brand/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13.5px] font-semibold leading-tight">{p.name}</p>
                  <Badge tone="brand">{p.kcal} kcal</Badge>
                </div>
                <p className="mt-1 text-[11.5px] text-muted">P {p.protein} · C {p.carbs} · G {p.fat} g</p>
                <p className="mt-2 text-[11px] text-muted">{p.meals.length} comidas · {p.assignedTo.length} asignados</p>
              </button>
            ))}
            {filtered.length === 0 && (
              <Card><EmptyState title="Sin planes" description="Crea el primer plan de alimentación." action={<Button size="sm" onClick={newPlan}>Crear plan</Button>} /></Card>
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
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted">Actualizado {fmtDate(selected.updatedAt)} · {selected.assignedTo.length} clientes</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditor(structuredClone(selected))}><Pencil size={14} /> Editar</Button>
                  <Button size="sm" variant="secondary" onClick={() => duplicate(selected)}><Copy size={14} /> Duplicar</Button>
                  <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer size={14} /> PDF</Button>
                  <Button size="sm" onClick={() => setAssignTo(selected)}><UserPlus size={14} /> Asignar</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Elimina el plan; los clientes asignados quedan sin plan y su PDF no se toca."
                    onClick={() => void remove(selected)}
                  >
                    <Trash2 size={14} /> Eliminar
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
                {[
                  ['Calorías', selected.kcal, 'kcal'],
                  ['Proteína', selected.protein, 'g'],
                  ['Carbohidratos', selected.carbs, 'g'],
                  ['Grasas', selected.fat, 'g'],
                ].map(([label, value, unit]) => (
                  <div key={label as string} className="rounded-xl bg-canvas px-3 py-2.5">
                    <p className="text-[10.5px] text-muted">{label}</p>
                    <p className="text-[16px] font-semibold">{value} <span className="text-[10px] font-normal text-muted">{unit}</span></p>
                  </div>
                ))}
              </div>

              <div className="divide-y divide-line border-t border-line">
                {selected.meals.map((meal) => (
                  <div key={meal.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-semibold uppercase tracking-wider text-brand">{meal.slot}</p>
                      <span className="text-[10.5px] text-muted">{meal.items.length} alimentos</span>
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {meal.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 text-[12.5px]">
                          <span>{item.food || '—'}</span>
                          <span className="shrink-0 text-muted">{item.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title={`Clientes con este plan (${selected.assignedTo.length})`} subtitle="Cambiar el plan reasigna a todos" />
              <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
                {selected.assignedTo.map((id) => {
                  const c = clients.find((x) => x.id === id)
                  if (!c) return null
                  return (
                    <div key={id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                      <Avatar name={c.name} color={avatarColor(c.id)} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium">{c.name}</p>
                        <p className="text-[10.5px] text-muted">{c.goal}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        ) : (
          <Card><EmptyState title="Selecciona un plan" description="Elige un plan de la lista para ver su contenido." /></Card>
        )}
      </div>

      <PlanEditor
        key={editor?.id ?? 'sin-plan'}
        plan={editor}
        onClose={() => setEditor(null)}
        onSave={async (p) => {
          const res = await saveMealPlan({ ...p, updatedAt: new Date().toISOString().slice(0, 10) })
          if (!res.ok) { notify(res.error ?? 'No se pudo guardar', 'warn'); return }
          setSelectedId(p.id)
          setEditor(null)
          notify('Plan guardado')
        }}
      />

      <Modal open={Boolean(assignTo)} onClose={() => setAssignTo(null)} title="Asignar plan" subtitle={assignTo?.name}>
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {clients.filter((c) => !c.archived).map((c) => {
            const assigned = assignTo?.assignedTo.includes(c.id)
            // Regla del plan Básico: al asignar alimentación a quien ya tiene
            // rutina, el coach la reemplaza en un paso confirmado.
            const conflict = !assigned && !hasFullAnthro(c) && Boolean(c.routineId)
            return (
              <button
                key={c.id}
                onClick={async () => {
                  if (!assignTo) return
                  if (conflict && !window.confirm(`Plan Básico: ${c.name} ya tiene rutina de entrenamiento. ¿Quitarla y asignar este plan?`)) return
                  if (conflict) await unassignRoutine(c.id)
                  await assignMealPlan(assignTo.id, c.id)
                  notify(
                    conflict
                      ? `Rutina quitada · plan asignado a ${c.name.split(' ')[0]}`
                      : `Plan asignado a ${c.name.split(' ')[0]}`,
                  )
                  setAssignTo(null)
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-canvas"
              >
                <Avatar name={c.name} color={avatarColor(c.id)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{c.name}</p>
                  <p className="text-[11px] text-muted">{c.goal}</p>
                  {conflict && (
                    <p className="mt-1 rounded-lg bg-warn-soft px-2 py-1 text-[10.5px] leading-snug text-warn">
                      Plan Básico: solo un apartado. Al asignar se quita su rutina de entrenamiento.
                    </p>
                  )}
                </div>
                {assigned && <Badge tone="brand">Asignado</Badge>}
              </button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}

function PlanEditor({
  plan, onClose, onSave,
}: {
  plan: MealPlan | null
  onClose: () => void
  onSave: (p: MealPlan) => void
}) {
  const [draft, setDraft] = useState<MealPlan | null>(() => (plan ? structuredClone(plan) : null))

  if (!plan || !draft) return null

  const update = (patch: Partial<MealPlan>) => setDraft({ ...draft, ...patch })
  const macroTotal = draft.protein * 4 + draft.carbs * 4 + draft.fat * 9

  return (
    <Modal
      open
      onClose={onClose}
      title="Editor de plan"
      subtitle="Macros y tiempos de comida"
      wide
      footer={
        <div className="flex justify-between gap-3">
          <p className={cx('text-[11.5px]', Math.abs(macroTotal - draft.kcal) > 80 ? 'text-warn' : 'text-muted')}>
            Macros ≈ {macroTotal} kcal {Math.abs(macroTotal - draft.kcal) > 80 ? `(≠ ${draft.kcal} declaradas)` : '· cuadra'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={() => onSave(draft)}>Guardar plan</Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del plan" className="sm:col-span-2">
          <input className={inputClass} value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Calorías">
          <input className={inputClass} type="number" value={draft.kcal} onChange={(e) => update({ kcal: Number(e.target.value) })} />
        </Field>
        <Field label="Proteína (g)">
          <input className={inputClass} type="number" value={draft.protein} onChange={(e) => update({ protein: Number(e.target.value) })} />
        </Field>
        <Field label="Carbohidratos (g)">
          <input className={inputClass} type="number" value={draft.carbs} onChange={(e) => update({ carbs: Number(e.target.value) })} />
        </Field>
        <Field label="Grasas (g)">
          <input className={inputClass} type="number" value={draft.fat} onChange={(e) => update({ fat: Number(e.target.value) })} />
        </Field>
      </div>

      <div className="mt-5 space-y-3">
        {draft.meals.map((meal, mi) => (
          <div key={meal.id} className="rounded-2xl border border-line p-3">
            <div className="flex items-center gap-2">
              <input
                className={cx(inputClass, 'h-9 py-1 text-[13px] font-medium')}
                value={meal.slot}
                onChange={(e) => {
                  const meals = [...draft.meals]
                  meals[mi] = { ...meal, slot: e.target.value }
                  update({ meals })
                }}
              />
              <button
                onClick={() => update({ meals: draft.meals.filter((m) => m.id !== meal.id) })}
                className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"
                aria-label="Eliminar comida"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              {meal.items.map((item, ii) => (
                <div key={item.id} className="grid grid-cols-[1fr_90px_28px] gap-1.5">
                  <input
                    className={cx(inputClass, 'h-9 py-1 text-[12.5px]')}
                    placeholder="Alimento"
                    value={item.food}
                    onChange={(e) => {
                      const meals = [...draft.meals]
                      const items = [...meal.items]
                      items[ii] = { ...item, food: e.target.value }
                      meals[mi] = { ...meal, items }
                      update({ meals })
                    }}
                  />
                  <input
                    className={cx(inputClass, 'h-9 px-2 py-1 text-[12px]')}
                    placeholder="Cantidad"
                    value={item.qty}
                    onChange={(e) => {
                      const meals = [...draft.meals]
                      const items = [...meal.items]
                      items[ii] = { ...item, qty: e.target.value }
                      meals[mi] = { ...meal, items }
                      update({ meals })
                    }}
                  />
                  <button
                    onClick={() => {
                      const meals = [...draft.meals]
                      meals[mi] = { ...meal, items: meal.items.filter((x) => x.id !== item.id) }
                      update({ meals })
                    }}
                    className="rounded-md p-1 text-muted hover:text-danger"
                    aria-label="Quitar alimento"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const meals = [...draft.meals]
                meals[mi] = { ...meal, items: [...meal.items, { id: uid('i'), food: '', qty: '' }] }
                update({ meals })
              }}
              className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-brand"
            >
              <Plus size={12} /> Agregar alimento
            </button>
          </div>
        ))}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => update({ meals: [...draft.meals, { id: uid('meal'), slot: 'Nueva comida', items: [{ id: uid('i'), food: '', qty: '' }] }] })}
        >
          <UtensilsCrossed size={14} /> Agregar comida
        </Button>
      </div>
    </Modal>
  )
}
