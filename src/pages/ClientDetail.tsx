import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarDays, ChevronDown, Copy, Download, Dumbbell, Eye, FileText, HeartPulse,
  MessageCircle, Pencil, Phone, Plus, Printer, ShieldAlert, Trash2, TrendingDown, Upload, Wallet,
} from 'lucide-react'
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../store/AppStore'
import { apiClientCheckins, apiClientExerciseLogs, apiClientFeedback, apiExercises, mealPdfUrl } from '../lib/api'
import ImportRoutineModal from '../components/ImportRoutineModal'
import RoutineEditor from '../components/RoutineEditor'
import {
  avatarColor, clientStatus, daysBetween, daysLeft, fmtDate, fmtDateShort, mxn, STATUS_META, todayISO,
} from '../lib/format'
import { VIP_PRICE, anthroPlanLabel, hasFoodPlan, hasFullAnthro } from '../lib/plans'
import type { AnthroRecord, Client, ExerciseCatalogItem, ExerciseFeedback, ExerciseLog, Routine, RoutineCheckin } from '../types'
import {
  Avatar, Badge, Button, Card, CardHeader, CopyButton, EmptyState, Field, Modal, Progress, Tabs, cx, inputClass, selectCompact,
} from '../components/ui'

type Tab = 'resumen' | 'antropometria' | 'rutina' | 'plan' | 'pagos'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'antropometria', label: 'Antropometría' },
  { value: 'rutina', label: 'Rutina' },
  { value: 'plan', label: 'Plan de alimentación' },
  { value: 'pagos', label: 'Pagos' },
]

export default function ClientDetail() {
  const { id, tab } = useParams<{ id: string; tab?: string }>()
  const navigate = useNavigate()
  const {
    clients, anthro, routines, mealPlans, payments, viewRole, addAnthro, updateClient,
    archiveClient, assignRoutine, unassignRoutine, customizeRoutine, saveRoutine, assignMealPlan,
    uploadMealPdf, removeMealPdf, clearFoodPlan, unassignMealPlan, registerPayment, notify, users, settings,
  } = useApp()

  const client = clients.find((c) => c.id === id)
  // Regla del plan Básico: rutina o alimentación, nunca los dos. Bandera por
  // cada dirección del reemplazo confirmado.
  const basicWithFood = Boolean(client && !hasFullAnthro(client) && hasFoodPlan(client))
  const basicWithRoutine = Boolean(client && !hasFullAnthro(client) && client.routineId)
  const activeTab = (TABS.find((t) => t.value === tab)?.value ?? 'resumen') as Tab
  const [anthroOpen, setAnthroOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [routineOpen, setRoutineOpen] = useState(false)
  const [routineImportOpen, setRoutineImportOpen] = useState(false)
  const [routineEdit, setRoutineEdit] = useState<Routine | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [customizing, setCustomizing] = useState(false)
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([])
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [logs, setLogs] = useState<ExerciseLog[]>([])
  const [feedback, setFeedback] = useState<ExerciseFeedback[]>([])
  const [checkins, setCheckins] = useState<RoutineCheckin[]>([])

  const loadTraining = useCallback(async () => {
    if (!id) return
    try {
      const [logData, feedbackData, checkinData] = await Promise.all([
        apiClientExerciseLogs(id),
        apiClientFeedback(id),
        apiClientCheckins(id),
      ])
      setLogs(logData.logs)
      setFeedback(feedbackData.feedback)
      setCheckins(checkinData.checkins)
    } catch {
      // La ficha sigue operando aunque el seguimiento no responda.
    }
  }, [id])

  useEffect(() => {
    void loadTraining()
  }, [loadTraining])

  // Catálogo para enlazar los ejercicios de una rutina importada.
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

  if (!client) {
    return (
      <EmptyState
        title="Cliente no encontrado"
        description="El registro pudo haberse archivado o el enlace es incorrecto."
        action={<Link to="/clientes"><Button size="sm" variant="secondary">Volver a clientes</Button></Link>}
      />
    )
  }

  const status = clientStatus(client)
  const left = daysLeft(client.endDate)
  // Ciclo pagado vigente: tras una renovación aprobada la barra cuenta desde
  // esa renovación, no desde el alta original (0.27.13).
  const cycleStart = client.cycleStart ?? client.startDate
  const total = Math.max(1, daysBetween(cycleStart, client.endDate))
  const elapsed = Math.max(0, Math.min(total, total - left))
  const routine = routines.find((r) => r.id === client.routineId)
  const templates = routines.filter((r) => !r.clientId)
  const plan = mealPlans.find((p) => p.id === client.mealPlanId)
  const fullAnthro = hasFullAnthro(client)
  const records = anthro.filter((a) => a.clientId === client.id).sort((a, b) => a.date.localeCompare(b.date))
  const latest = records[records.length - 1]
  const prev = records[records.length - 2]
  const clientPayments = payments.filter((p) => p.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date))
  const coach = users.find((u) => u.id === client.coachId)
  const waLink = `https://wa.me/52${client.phone.replace(/\D/g, '')}`

  const routineLogs = logs.filter((log) => !routine || log.routineId === routine.id)
  const monthKey = todayISO().slice(0, 7)
  const monthCheckins = checkins
    .filter((checkin) => checkin.date.startsWith(monthKey))
    .sort((a, b) => a.date.localeCompare(b.date))
  const intensityData = monthCheckins.map((checkin) => ({
    day: Number(checkin.date.slice(8, 10)),
    intensity: checkin.intensity,
  }))
  const averageIntensity = monthCheckins.length
    ? monthCheckins.reduce((sum, checkin) => sum + checkin.intensity, 0) / monthCheckins.length
    : 0

  const goTab = (t: Tab) => navigate(`/clientes/${client.id}${t === 'resumen' ? '' : `/${t}`}`)

  /** Sube o reemplaza el plan de alimentación del cliente en PDF. */
  const onMealPdfFile = async (file?: File) => {
    if (!file || pdfBusy) return
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
      notify('Selecciona un archivo PDF.', 'warn')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('El PDF supera el máximo de 5 MB.', 'warn')
      return
    }
    setPdfBusy(true)
    await uploadMealPdf(client.id, file)
    setPdfBusy(false)
  }

  return (
    <>
      <button onClick={() => navigate('/clientes')} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink">
        <ArrowLeft size={15} /> Clientes
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={client.name} color={avatarColor(client.id)} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[23px] font-semibold tracking-tight">{client.name}</h1>
              <Badge tone={status === 'activo' ? 'brand' : status === 'por_vencer' ? 'warn' : status === 'pausado' ? 'neutral' : 'danger'} dot={STATUS_META[status].dot}>
                {STATUS_META[status].label}
              </Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">{client.goal} · Coach {coach?.name ?? '—'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted">
              <a href={`tel:${client.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                <Phone size={13} /> {client.phone || '—'}
              </a>
              {client.phone && (
                <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand hover:text-brand-dark">
                  <MessageCircle size={13} /> WhatsApp
                </a>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={13} /> Desde {fmtDate(client.startDate)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPayOpen(true)}>
            <Wallet size={15} /> Registrar pago
          </Button>
          <Button size="sm" onClick={() => setAnthroOpen(true)}>
            <Plus size={15} /> Medición
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} aria-label="Editar ficha">
            <Pencil size={15} />
          </Button>
          {viewRole === 'admin' && (
            <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(true)} aria-label="Archivar cliente">
              <Trash2 size={15} className="text-danger" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 border-b border-line">
        <Tabs value={activeTab} onChange={(t) => goTab(t as Tab)} items={TABS} />
      </div>

      {activeTab === 'resumen' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Membresía actual</p>
                  <p className="mt-1 text-[19px] font-semibold">
                    {left < 0 ? `Venció hace ${Math.abs(left)} días` : `${left} días restantes`}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {fmtDate(client.startDate)} — {fmtDate(client.endDate)} · {mxn(client.price)} / mes
                  </p>
                </div>
                <Badge tone={left < 0 ? 'danger' : left <= 7 ? 'warn' : 'brand'}>
                  {left < 0 ? 'Vencida' : left <= 7 ? 'Renovar pronto' : 'Vigente'}
                </Badge>
              </div>
              <Progress className="mt-4" value={(elapsed / total) * 100} tone={left < 0 ? 'danger' : left <= 7 ? 'warn' : 'brand'} />
              <div className="mt-2 flex justify-between text-[11px] text-muted">
                <span>Inicio</span>
                <span>{Math.round((elapsed / total) * 100)}% del ciclo</span>
                <span>Fin</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <Button size="sm" variant="soft" onClick={() => setPayOpen(true)}>Registrar renovación</Button>
                <a href={waLink} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost"><MessageCircle size={14} /> Enviar recordatorio</Button>
                </a>
              </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader title="Rutina asignada" action={<Badge tone={routine ? 'brand' : 'neutral'}>{routine ? 'Activa' : 'Sin asignar'}</Badge>} />
                <div className="px-5 pb-5">
                  {routine ? (
                    <>
                      <p className="text-[14px] font-medium">{routine.name}</p>
                      <p className="mt-1 text-[12px] text-muted">{routine.days.length} días · {routine.weeks} semanas · {routine.level}</p>
                      <Button size="sm" variant="ghost" className="mt-2 px-0" onClick={() => goTab('rutina')}>
                        Ver rutina <ChevronDown size={14} className="-rotate-90" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-[12.5px] text-muted">Aún no tiene una rutina asignada.</p>
                      <Button size="sm" variant="soft" className="mt-3" onClick={() => goTab('rutina')}>Asignar rutina</Button>
                    </>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="Plan de alimentación" action={<Badge tone={plan ? 'brand' : 'neutral'}>{plan ? 'Activo' : 'Sin asignar'}</Badge>} />
                <div className="px-5 pb-5">
                  {plan ? (
                    <>
                      <p className="text-[14px] font-medium">{plan.kcal.toLocaleString('es-MX')} kcal</p>
                      <p className="mt-1 text-[12px] text-muted">P {plan.protein} g · C {plan.carbs} g · G {plan.fat} g</p>
                      <Button size="sm" variant="ghost" className="mt-2 px-0" onClick={() => goTab('plan')}>
                        Ver plan <ChevronDown size={14} className="-rotate-90" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-[12.5px] text-muted">Sin plan asignado todavía.</p>
                      <Button size="sm" variant="soft" className="mt-3" onClick={() => goTab('plan')}>Asignar plan</Button>
                    </>
                  )}
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader
                title="Última medición"
                subtitle={latest ? `${fmtDate(latest.date)} · registrada por ${latest.createdBy}${latest.source === 'cliente' ? ' (cliente)' : ''}` : 'Sin registros'}
                action={<Button size="sm" variant="ghost" onClick={() => goTab('antropometria')}>Ver historial</Button>}
              />
              {latest ? (
                <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4">
                  {[
                    { label: 'Peso', value: `${latest.weight} kg`, diff: prev ? latest.weight - prev.weight : 0, unit: 'kg' },
                    { label: '% grasa', value: latest.bodyFat ? `${latest.bodyFat}%` : '—', diff: latest.bodyFat && prev?.bodyFat ? latest.bodyFat - prev.bodyFat : 0, unit: '%' },
                    { label: 'Cintura', value: latest.waist ? `${latest.waist} cm` : '—', diff: latest.waist && prev?.waist ? latest.waist - prev.waist : 0, unit: 'cm' },
                    { label: 'IMC', value: (latest.weight / Math.pow(latest.height / 100, 2)).toFixed(1), diff: 0, unit: '' },
                  ].map((m) => (
                    <div key={m.label} className="rounded-xl bg-canvas px-3 py-2.5">
                      <p className="text-[11px] text-muted">{m.label}</p>
                      <p className="mt-0.5 text-[15px] font-semibold">{m.value}</p>
                      {m.diff !== 0 && (
                        <p className={cx('mt-0.5 flex items-center gap-1 text-[10.5px]', m.diff < 0 ? 'text-brand' : 'text-warn')}>
                          <TrendingDown size={11} className={m.diff > 0 ? 'rotate-180' : ''} />
                          {m.diff > 0 ? '+' : ''}{m.diff.toFixed(1)} {m.unit}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 pb-5">
                  <Button size="sm" variant="soft" onClick={() => setAnthroOpen(true)}>Registrar primera medición</Button>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Adherencia" subtitle="Últimos 30 días" />
              <div className="px-5 pb-5">
                <div className="flex items-end justify-between">
                  <p className="text-[30px] font-semibold leading-none">{client.adherence}%</p>
                  <Badge tone={client.adherence >= 75 ? 'brand' : client.adherence >= 60 ? 'warn' : 'danger'}>
                    {client.adherence >= 75 ? 'Muy buena' : client.adherence >= 60 ? 'Irregular' : 'Baja'}
                  </Badge>
                </div>
                <Progress className="mt-3" value={client.adherence} tone={client.adherence >= 75 ? 'brand' : client.adherence >= 60 ? 'warn' : 'danger'} />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-canvas px-3 py-2">
                    <p className="text-[10.5px] text-muted">Último check-in</p>
                    <p className="text-[12.5px] font-medium">{fmtDateShort(client.lastCheckin)}</p>
                  </div>
                  <div className="rounded-xl bg-canvas px-3 py-2">
                    <p className="text-[10.5px] text-muted">Registros antro.</p>
                    <p className="text-[12.5px] font-medium">{records.length}</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Datos de contacto" />
              <div className="space-y-3 px-5 pb-5 text-[12.5px]">
                <div><p className="text-[10.5px] uppercase tracking-wider text-muted">Teléfono</p><p>{client.phone || '—'}</p></div>
                <div><p className="text-[10.5px] uppercase tracking-wider text-muted">Correo</p><p className="break-all">{client.email || '—'}</p></div>
                <div><p className="text-[10.5px] uppercase tracking-wider text-muted">Nacimiento</p><p>{client.birthDate ? fmtDate(client.birthDate) : '—'}</p></div>
                <div><p className="text-[10.5px] uppercase tracking-wider text-muted">Sexo</p><p>{client.sexo ? (client.sexo === 'masculino' ? 'Masculino' : 'Femenino') : '—'}</p></div>
                <div><p className="text-[10.5px] uppercase tracking-wider text-muted">Emergencia</p><p>{client.emergencyName} · {client.emergencyPhone}</p></div>
              </div>
            </Card>

            <Card className="border-dashed bg-canvas/50">
              <div className="flex items-start gap-2.5 p-4">
                <ShieldAlert size={15} className="mt-0.5 shrink-0 text-muted" />
                <p className="text-[11.5px] leading-relaxed text-muted">
                  Datos de salud protegidos. Solo el coach asignado y el administrador pueden consultarlos.
                  Todo cambio queda registrado en auditoría.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'antropometria' && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                {records.length} mediciones · la más reciente {latest ? fmtDate(latest.date) : '—'}
                <Badge tone={fullAnthro ? 'brand' : 'neutral'}>{anthroPlanLabel(client)}</Badge>
              </p>
              {!fullAnthro && (
                <p className="mt-1 text-[11px] text-muted">
                  La antropometría completa (circunferencias, pliegues y diámetros óseos) se habilita
                  con el plan VIP, de ${VIP_PRICE.toLocaleString('es-MX')} o más.
                </p>
              )}
            </div>
            <Button size="sm" onClick={() => setAnthroOpen(true)}><Plus size={15} /> Nueva medición</Button>
          </div>

          {records.length === 0 ? (
            <Card><EmptyState title="Sin mediciones" description="Registra peso, grasa y perímetros para dar seguimiento." /></Card>
          ) : (
            <>
              <Card className="p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <div>
                    <p className="text-[13px] font-semibold">Evolución de peso</p>
                    <p className="text-[11.5px] text-muted">{records.length} registros</p>
                  </div>
                  {latest && prev && (
                    <Badge tone={latest.weight <= prev.weight ? 'brand' : 'warn'}>
                      {latest.weight > prev.weight ? '+' : ''}{(latest.weight - prev.weight).toFixed(1)} kg
                    </Badge>
                  )}
                </div>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={records.map((r) => ({ ...r, label: fmtDateShort(r.date) }))}>
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                      <YAxis domain={['dataMin - 2', 'dataMax + 2']} tickLine={false} axisLine={false} width={34} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                      <Tooltip
                        formatter={(v) => [`${v} kg`, 'Peso']}
                        contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 12 }}
                      />
                      <Line type="monotone" dataKey="weight" stroke="var(--color-brand)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--color-brand)' }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <Card>
                  <CardHeader title="Última medición" subtitle={latest ? fmtDate(latest.date) : ''} />
                  {latest && (
                    <div className="space-y-3 px-4 pb-4">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ['Peso', `${latest.weight} kg`],
                          ['Estatura', `${latest.height} cm`],
                          ['% grasa', latest.bodyFat ? `${latest.bodyFat}%` : '—'],
                          ['IMC', (latest.weight / Math.pow(latest.height / 100, 2)).toFixed(1)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl bg-canvas px-3 py-2">
                            <p className="text-[10.5px] text-muted">{label}</p>
                            <p className="text-[13.5px] font-medium">{value}</p>
                          </div>
                        ))}
                      </div>
                      {fullAnthro && (
                        <AnthroGroup
                          title="Circunferencias"
                          rows={[
                            ['Brazo relajado', latest.arm, 'cm'], ['Brazo flexionado', latest.armFlexed, 'cm'],
                            ['Cintura', latest.waist, 'cm'], ['Cadera', latest.hip, 'cm'],
                            ['Muslo', latest.thigh, 'cm'], ['Pantorrilla', latest.calf, 'cm'],
                          ]}
                        />
                      )}
                      {!fullAnthro && (
                        <AnthroGroup
                          title="Circunferencias básicas"
                          rows={[
                            ['Cintura', latest.waist, 'cm'], ['Cadera', latest.hip, 'cm'],
                          ]}
                        />
                      )}
                      {fullAnthro && (
                        <>
                          <AnthroGroup
                            title="Pliegues cutáneos"
                            rows={[
                              ['Tríceps', latest.skinfoldTriceps, 'mm'], ['Bíceps', latest.skinfoldBiceps, 'mm'],
                              ['Espalda', latest.skinfoldSubscapular, 'mm'], ['Cresta iliaca', latest.skinfoldIliac, 'mm'],
                              ['Supraespinal', latest.skinfoldSupraspinal, 'mm'], ['Abdominal', latest.skinfoldAbdominal, 'mm'],
                              ['Muslo medial', latest.skinfoldThigh, 'mm'], ['Pantorrilla', latest.skinfoldCalf, 'mm'],
                            ]}
                          />
                          <AnthroGroup
                            title="Diámetros óseos"
                            rows={[
                              ['Muñeca', latest.diameterWrist, 'cm'], ['Codo', latest.diameterElbow, 'cm'],
                              ['Rodilla', latest.diameterKnee, 'cm'],
                            ]}
                          />
                        </>
                      )}
                    </div>
                  )}
                  {latest?.notes && <p className="mx-4 mb-4 rounded-xl bg-brand-soft/50 px-3 py-2 text-[11.5px] text-brand-dark">{latest.notes}</p>}
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader title="Historial" subtitle="Valores crudos, sin recálculos" />
                  <div className="overflow-x-auto border-t border-line">
                    <table className="w-full text-[12px]">
                      <thead className="bg-canvas/60 text-left text-[10.5px] uppercase tracking-wider text-muted">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Fecha</th>
                          <th className="px-3 py-2 font-semibold">Peso</th>
                          <th className="px-3 py-2 font-semibold">% Grasa</th>
                          <th className="px-3 py-2 font-semibold">Cintura</th>
                          <th className="px-4 py-2 font-semibold">Registró</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...records].reverse().map((r) => (
                          <tr key={r.id} className="border-t border-line/70">
                            <td className="px-4 py-2 whitespace-nowrap">{fmtDateShort(r.date)}</td>
                            <td className="px-3 py-2 font-medium">{r.weight} kg</td>
                            <td className="px-3 py-2">{r.bodyFat ? `${r.bodyFat}%` : '—'}</td>
                            <td className="px-3 py-2">{r.waist ? `${r.waist} cm` : '—'}</td>
                            <td className="px-4 py-2 text-muted">
                              {r.createdBy}
                              {r.source === 'cliente' && <span className="ml-1 rounded bg-sand px-1 py-0.5 text-[9.5px]">cliente</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'rutina' && (
        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader
              title="Rutina asignada"
              subtitle={routine
                ? `${routine.name} · ${routine.weeks} semanas · ${routine.level}${routine.clientId ? ' · personalizada' : ''}`
                : 'Sin rutina activa'}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={routine ? 'secondary' : 'primary'}
                    onClick={() => setRoutineOpen(true)}
                  >
                    <Dumbbell size={14} /> {routine ? 'Cambiar rutina' : 'Asignar rutina'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRoutineImportOpen(true)}>
                    <Upload size={14} /> Importar
                  </Button>
                  {routine && (
                    routine.clientId ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRoutineEdit(routine)}
                      >
                        <Pencil size={14} /> Editar para este cliente
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={customizing}
                        onClick={async () => {
                          if (!window.confirm(
                            `Se creará una copia de «${routine.name}» solo para ${client.name}. La plantilla original y los demás clientes no cambiarán.`,
                          )) return
                          setCustomizing(true)
                          const res = await customizeRoutine(routine.id, client.id)
                          setCustomizing(false)
                          if (!res.ok || !res.routine) return
                          notify('Rutina personalizada · la plantilla quedó intacta')
                          setRoutineEdit(res.routine)
                        }}
                      >
                        <Copy size={14} /> {customizing ? 'Personalizando…' : 'Personalizar'}
                      </Button>
                    )
                  )}
                  {routine && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (!window.confirm(`¿Quitar «${routine.name}» a ${client.name}? El cliente quedará sin plan hasta que le asignes otra rutina.`)) return
                        await unassignRoutine(client.id)
                        notify('Rutina quitada · el cliente queda sin plan')
                      }}
                    >
                      <Trash2 size={14} /> Quitar
                    </Button>
                  )}
                </div>
              }
            />
            <p className="border-b border-line bg-canvas/50 px-5 py-2 text-[11px] text-muted">
              {routine?.clientId
                ? 'Esta copia es exclusiva del cliente: puedes editar días, ejercicios y orden sin tocar la plantilla original.'
                : 'Al terminar el bloque, cambia la rutina o quítala según el seguimiento del cliente. Usa «Personalizar» para ajustar solo a este cliente sin cambiar la plantilla.'}
            </p>
            {!routine ? (
              <div className="px-5 pb-5">
                <EmptyState title="Sin rutina" description="Asigna una plantilla existente o crea una nueva desde el módulo Rutinas." />
              </div>
            ) : (
              <div className="divide-y divide-line border-t border-line">
                {routine.days.map((day) => (
                  <div key={day.id}>
                    <button
                      onClick={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-canvas/60"
                    >
                      <div>
                        <p className="text-[13.5px] font-medium">{day.name}</p>
                        <p className="text-[11.5px] text-muted">{day.focus} · {day.exercises.length} ejercicios</p>
                      </div>
                      <ChevronDown size={16} className={cx('text-muted transition-transform', expandedDay === day.id && 'rotate-180')} />
                    </button>
                    {expandedDay === day.id && (
                      <div className="space-y-2 bg-canvas/40 px-5 pb-4">
                        {day.exercises
                          .slice()
                          .sort((a, b) => Number(b.cardio ?? false) - Number(a.cardio ?? false))
                          .map((ex, index, list) => {
                            const previous = list[index - 1]
                            const startsCardioGroup = ex.cardio && !(previous?.cardio ?? false)
                            return (
                              <Fragment key={ex.id}>
                                {startsCardioGroup && (
                                  <p className="flex items-center gap-1.5 px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warn">
                                    <HeartPulse size={11} /> Cardio
                                  </p>
                                )}
                                <div className="flex items-start justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
                                  <div>
                                    <p className="text-[12.5px] font-medium">{ex.name}</p>
                                    {ex.notes && <p className="text-[11px] text-muted">{ex.notes}</p>}
                                  </div>
                                  <div className="shrink-0 text-right text-[11.5px] text-muted">
                                    {ex.cardio ? (
                                      <p>{ex.minutes ?? 20} min de cardio</p>
                                    ) : (
                                      <>
                                        <p>{ex.sets} × {ex.reps}</p>
                                        <p>Desc. {ex.rest}</p>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </Fragment>
                            )
                          })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Cargas del cliente"
              subtitle={routine ? `Historial de «${routine.name}»` : 'Historial de entrenamiento'}
            />
            {routineLogs.length === 0 ? (
              <p className="px-5 pb-5 text-[11.5px] text-muted">
                El cliente aún no registra series. Puede hacerlo desde su portal, en la pestaña Rutina.
              </p>
            ) : (
              <div className="divide-y divide-line border-t border-line">
                {routineLogs.slice(0, 8).map((log) => (
                  <div key={log.id} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="font-medium">{log.exerciseName}</span>
                      <span className="text-muted">{fmtDate(log.date)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {log.sets.map((set) => `${set.weight ?? '—'} kg × ${set.reps}`).join(' · ')}
                      {log.sets[0]?.restSeconds ? ` · desc. ${log.sets[0].restSeconds} s` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Intensidad del mes"
              subtitle={routine ? `${routine.name} · 1 a 10` : 'Sin rutina activa'}
            />
            {intensityData.length === 0 ? (
              <p className="px-5 pb-5 text-[11.5px] text-muted">
                Aún no hay intensidad registrada este mes.
              </p>
            ) : (
              <div className="px-4 pb-4">
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={intensityData}>
                      <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                      <YAxis domain={[0, 10]} ticks={[1, 5, 10]} width={20} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                      <Tooltip formatter={(v) => [`${v}/10`, 'Intensidad']} contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 12 }} />
                      <Bar dataKey="intensity" fill="var(--color-brand)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-muted">
                  Promedio: {averageIntensity.toFixed(1)}/10 · {monthCheckins.length} sesión(es)
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Reacciones del cliente" subtitle="👍 le gusta · 👎 no le gusta" />
            {feedback.length === 0 ? (
              <p className="px-5 pb-5 text-[11.5px] text-muted">Todavía no reacciona a ningún ejercicio.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 px-5 pb-5">
                {feedback.map((item) => (
                  <Badge key={`${item.routineId}-${item.exerciseName}`} tone={item.value === 'like' ? 'brand' : 'neutral'}>
                    {item.value === 'like' ? '👍' : '👎'} {item.exerciseName}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          <Card className="border-dashed bg-canvas/50">
            <div className="flex items-start gap-2.5 p-4">
              <Dumbbell size={15} className="mt-0.5 shrink-0 text-muted" />
              <p className="text-[11.5px] leading-relaxed text-muted">
                Usa <strong>Personalizar</strong> para crear una copia solo de este cliente y ajustar
                días, ejercicios u orden sin cambiar la plantilla original ni a los demás asignados.
              </p>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'plan' && (
        <div className="mt-4 space-y-4">
          <Card>
            {basicWithRoutine && (
              <div className="rounded-none rounded-t-2xl bg-warn-soft px-5 py-2.5 text-[11.5px] leading-relaxed text-warn">
                Plan Básico: este cliente ya tiene rutina de entrenamiento, así que no
                puede llevar plan de alimentación. Súbelo a VIP ($2,000+) para
                incluir ambos, o quítale la rutina.
              </div>
            )}
            <CardHeader
              title="Plan de alimentación"
              subtitle={plan ? `${plan.name} · actualizado ${fmtDate(plan.updatedAt)}` : 'Sin plan activo'}
              action={
                <select
                  className={cx(selectCompact, 'h-9 py-1 text-[12px]')}
                  value={client.mealPlanId ?? ''}
                  disabled={basicWithRoutine}
                  title={basicWithRoutine ? 'Plan Básico: quita la rutina antes de asignar un plan de alimentación.' : undefined}
                  onChange={(e) => {
                    if (!e.target.value) return
                    assignMealPlan(e.target.value, client.id)
                    notify('Plan asignado')
                  }}
                >
                  <option value="">Asignar plan…</option>
                  {mealPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              }
            />
            {/* Plan en PDF: el coach lo sube y el cliente lo descarga desde su portal. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
              <div className="min-w-0">
                <p className="text-[12px] font-medium">Plan en PDF</p>
                {client.mealPdfKey ? (
                  <p className="truncate text-[11px] text-muted">
                    {client.mealPdfName} · subido {fmtDate(client.mealPdfUpdatedAt ?? '')}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted">
                    Sube el plan de alimentación en PDF; el cliente lo ve y lo descarga desde su portal.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {client.mealPdfKey && (
                  <>
                    <a href={mealPdfUrl(client.mealPdfKey)} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="secondary"><Eye size={14} /> Ver</Button>
                    </a>
                    <a href={mealPdfUrl(client.mealPdfKey)} download={client.mealPdfName ?? 'plan.pdf'}>
                      <Button size="sm" variant="secondary"><Download size={14} /> Descargar</Button>
                    </a>
                  </>
                )}
                <Button
                  size="sm"
                  disabled={pdfBusy || (basicWithRoutine && !client.mealPdfKey)}
                  title={basicWithRoutine && !client.mealPdfKey ? 'Plan Básico: quita la rutina antes de subir el PDF de alimentación.' : undefined}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  <Upload size={14} /> {client.mealPdfKey ? 'Reemplazar' : 'Subir PDF'}
                </Button>
                {client.mealPdfKey && (
                  <Button size="sm" variant="ghost" onClick={() => void removeMealPdf(client.id)}>
                    <Trash2 size={14} /> Eliminar
                  </Button>
                )}
              </div>
            </div>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                void onMealPdfFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {!plan ? (
              <div className="px-5 pb-5">
                <EmptyState title="Sin plan" description="Asigna un plan existente o créalo desde el módulo Planes." />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4">
                  {[
                    ['Calorías', `${plan.kcal}`, 'kcal'],
                    ['Proteína', `${plan.protein}`, 'g'],
                    ['Carbohidratos', `${plan.carbs}`, 'g'],
                    ['Grasas', `${plan.fat}`, 'g'],
                  ].map(([label, value, unit]) => (
                    <div key={label} className="rounded-xl bg-canvas px-3 py-2.5">
                      <p className="text-[10.5px] text-muted">{label}</p>
                      <p className="text-[16px] font-semibold">{value} <span className="text-[10px] font-normal text-muted">{unit}</span></p>
                    </div>
                  ))}
                </div>
                <div className="divide-y divide-line border-t border-line">
                  {plan.meals.map((meal) => (
                    <div key={meal.id} className="px-5 py-3">
                      <p className="text-[12px] font-semibold uppercase tracking-wider text-brand">{meal.slot}</p>
                      <ul className="mt-1.5 space-y-1">
                        {meal.items.map((item) => (
                          <li key={item.id} className="flex justify-between gap-3 text-[12.5px]">
                            <span>{item.food}</span>
                            <span className="shrink-0 text-muted">{item.qty}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 border-t border-line px-4 py-3">
                  <Button size="sm" variant="secondary" onClick={() => window.print()}>
                    <Printer size={14} /> Imprimir / PDF
                  </Button>
                  <a href={waLink} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost"><MessageCircle size={14} /> Enviar por WhatsApp</Button>
                  </a>
                  {/* 0.27.8: quitar solo el plan estructurado; si el cliente
                      tiene PDF, este queda intacto y sigue en su portal. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    title="Quita el plan estructurado; el plan en PDF del cliente (si tiene) no se toca."
                    onClick={() => void unassignMealPlan(client.id)}
                  >
                    <Trash2 size={14} /> Quitar plan
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'pagos' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="overflow-hidden">
            <CardHeader
              title="Historial de pagos"
              subtitle={`${clientPayments.length} movimientos`}
              action={<Button size="sm" onClick={() => setPayOpen(true)}><Plus size={14} /> Registrar</Button>}
            />
            {clientPayments.length === 0 ? (
              <EmptyState title="Sin pagos" description="Registra la primera transferencia de este cliente." />
            ) : (
              <div className="divide-y divide-line border-t border-line">
                {clientPayments.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-canvas text-muted"><FileText size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium">{p.reference}</p>
                      <p className="text-[11px] text-muted">{fmtDate(p.date)} · {p.method}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-medium">{mxn(p.amount)}</p>
                      <Badge tone={p.status === 'aprobado' ? 'brand' : p.status === 'pendiente' ? 'warn' : 'danger'}>
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Datos para transferencia" subtitle="Comparte con el cliente" />
            <div className="space-y-3 px-5 pb-5 text-[12.5px]">
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[10.5px] uppercase tracking-wider text-muted">Banco</p>
                <p className="font-medium">{settings.bank}</p>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10.5px] uppercase tracking-wider text-muted">CLABE interbancaria</p>
                    <p className="font-mono text-[12px] font-medium tracking-tight break-all">{settings.clabe}</p>
                  </div>
                  <CopyButton value={settings.clabe} label="CLABE" withText />
                </div>
              </div>
              {settings.bank2 && (
                <div className="rounded-xl bg-canvas p-3">
                  <p className="text-[10.5px] uppercase tracking-wider text-muted">Banco 2</p>
                  <p className="font-medium">{settings.bank2}</p>
                </div>
              )}
              {settings.clabe2 && (
                <div className="rounded-xl bg-canvas p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10.5px] uppercase tracking-wider text-muted">CLABE 2</p>
                      <p className="font-mono text-[12px] font-medium tracking-tight break-all">{settings.clabe2}</p>
                    </div>
                    <CopyButton value={settings.clabe2} label="CLABE 2" withText />
                  </div>
                </div>
              )}
              <div className="rounded-xl bg-canvas p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10.5px] uppercase tracking-wider text-muted">Alias</p>
                    <p className="font-mono text-[12px] font-medium">{settings.alias}</p>
                  </div>
                  <CopyButton value={settings.alias} label="alias" />
                </div>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[10.5px] uppercase tracking-wider text-muted">Referencia sugerida</p>
                <p className="font-mono text-[12px] font-medium">ENT-{client.id.toUpperCase()}-####</p>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                Sin comisiones: el pago se concilia manualmente. Nunca se almacenan datos de tarjeta.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Modal antropometría */}
      <AnthroModal
        key={'anthro-' + client.id}
        open={anthroOpen}
        onClose={() => setAnthroOpen(false)}
        clientId={client.id}
        full={fullAnthro}
        last={latest}
        onSave={async (data) => {
          const res = await addAnthro({ ...data, clientId: client.id })
          if (!res.ok) { notify(res.error ?? 'No se pudo guardar', 'warn'); return }
          setAnthroOpen(false)
          notify('Medición registrada')
        }}
      />

      {/* Modal pago */}
      <PaymentModal
        key={'pago-' + client.id}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        client={client}
        onSave={async (amount, reference, date, days) => {
          const res = await registerPayment({ clientId: client.id, amount, reference, date, days })
          if (!res.ok) { notify(res.error ?? 'No se pudo registrar el pago', 'warn'); return }
          setPayOpen(false)
          notify('Pago registrado · queda pendiente de aprobación')
        }}
      />

      {/* Modal edición */}
      <EditClientModal
        key={'edicion-' + client.id}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        client={client}
        onSave={(patch) => {
          updateClient(client.id, patch)
          setEditOpen(false)
          notify('Ficha actualizada')
        }}
      />

      {/* Modal rutina */}
      <Modal
        open={routineOpen}
        onClose={() => setRoutineOpen(false)}
        title={routine ? 'Cambiar rutina' : 'Asignar rutina'}
        subtitle={client.name}
      >
        <p className="rounded-xl bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-muted">
          Elige la plantilla del siguiente bloque. Al asignarla reemplaza la rutina
          actual; el cliente la ve al instante en su portal.
        </p>
        {basicWithFood && (
          <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn">
            Plan Básico: solo un apartado. Al asignar la rutina se quita su plan de
            alimentación ({client.mealPlanId ? 'plan estructurado' : 'PDF'}).
          </p>
        )}
        {routine && (
          <button
            onClick={async () => {
              if (!window.confirm(`¿Quitar «${routine.name}» a ${client.name}? Quedará sin plan.`)) return
              await unassignRoutine(client.id)
              setRoutineOpen(false)
              notify('Rutina quitada · el cliente queda sin plan')
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-left text-[12.5px] font-medium text-danger"
          >
            <Trash2 size={14} /> Quitar la rutina actual
          </button>
        )}
        <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
          {templates.map((r) => {
            const current = r.id === client.routineId
            return (
              <button
                key={r.id}
                onClick={async () => {
                  if (current) { notify('Esta rutina ya está asignada'); return }
                  if (basicWithFood && !window.confirm(`Plan Básico: ${client.name} ya tiene plan de alimentación. ¿Quitarlo y asignar «${r.name}»?`)) return
                  if (basicWithFood) {
                    const ok = await clearFoodPlan(client.id)
                    if (!ok) return
                  }
                  await assignRoutine(r.id, client.id)
                  setRoutineOpen(false)
                  notify(basicWithFood ? `Plan de alimentación quitado · rutina «${r.name}» asignada` : `Rutina cambiada a «${r.name}»`)
                }}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  current ? 'border-brand bg-brand-soft/50' : 'border-line hover:border-brand/40',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{r.name}</p>
                  <p className="text-[11px] text-muted">
                    {r.days.length} días · {r.weeks} semanas · {r.level} · {r.goal}
                  </p>
                </div>
                {current
                  ? <Badge tone="brand">Actual</Badge>
                  : <span className="text-[11.5px] font-medium text-brand">Asignar</span>}
              </button>
            )
          })}
          {templates.length === 0 && (
            <p className="py-4 text-center text-[12px] text-muted">
              No hay plantillas. Crea una en el módulo Rutinas.
            </p>
          )}
        </div>
      </Modal>

      {routineImportOpen && (
        <ImportRoutineModal
          open
          onClose={() => setRoutineImportOpen(false)}
          catalog={catalog}
          onSave={saveRoutine}
          onSaved={(imported) => {
            void assignRoutine(imported.id, client.id).then(() =>
              notify(`Rutina «${imported.name}» importada y asignada`),
            )
          }}
        />
      )}

      {routineEdit && (
        <RoutineEditor
          routine={routineEdit}
          catalog={catalog}
          notify={notify}
          subtitle={`Solo para ${client.name} · la plantilla original no se modifica`}
          onClose={() => setRoutineEdit(null)}
          onSave={async (r) => {
            const res = await saveRoutine({ ...r, updatedAt: new Date().toISOString().slice(0, 10) })
            if (!res.ok) { notify(res.error ?? 'No se pudo guardar', 'warn'); return }
            setRoutineEdit(null)
            notify('Rutina del cliente actualizada')
          }}
        />
      )}

      {/* Modal archivar */}
      <Modal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archivar cliente"
        subtitle="Se conserva el historial y sale del padrón activo"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setArchiveOpen(false)}>Cancelar</Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                archiveClient(client.id)
                setArchiveOpen(false)
                notify('Cliente archivado')
                navigate('/clientes')
              }}
            >
              <Trash2 size={14} /> Archivar
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          <strong className="text-ink">{client.name}</strong> dejará de aparecer en el padrón activo y su
          lugar quedará disponible. Podrás restaurarlo desde la pestaña “Archivados”. Esta acción queda en
          auditoría.
        </p>
      </Modal>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Modales                                                                    */
/* -------------------------------------------------------------------------- */

function AnthroGroup({ title, rows }: { title: string; rows: Array<[string, number, string]> }) {
  const visible = rows.filter(([, value]) => Number(value) > 0)
  if (visible.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {visible.map(([label, value, unit]) => (
          <div key={label} className="rounded-xl bg-canvas px-3 py-2">
            <p className="text-[10.5px] text-muted">{label}</p>
            <p className="text-[13.5px] font-medium">{value} {unit}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AnthroModal({
  open, onClose, clientId, full, last, onSave,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  full: boolean
  last?: AnthroRecord
  onSave: (data: Omit<AnthroRecord, 'id' | 'createdBy' | 'source' | 'clientId'>) => void
}) {
  const value = (n?: number) => (n ? String(n) : '')
  const [form, setForm] = useState({
    date: todayISO(),
    weight: value(last?.weight),
    height: last?.height ? String(last.height) : '168',
    bodyFat: value(last?.bodyFat),
    waist: value(last?.waist),
    hip: value(last?.hip),
    arm: value(last?.arm),
    armFlexed: value(last?.armFlexed),
    thigh: value(last?.thigh),
    calf: value(last?.calf),
    skinfoldTriceps: value(last?.skinfoldTriceps),
    skinfoldBiceps: value(last?.skinfoldBiceps),
    skinfoldSubscapular: value(last?.skinfoldSubscapular),
    skinfoldIliac: value(last?.skinfoldIliac),
    skinfoldSupraspinal: value(last?.skinfoldSupraspinal),
    skinfoldAbdominal: value(last?.skinfoldAbdominal),
    skinfoldThigh: value(last?.skinfoldThigh),
    skinfoldCalf: value(last?.skinfoldCalf),
    diameterWrist: value(last?.diameterWrist),
    diameterElbow: value(last?.diameterElbow),
    diameterKnee: value(last?.diameterKnee),
    notes: '',
  })
  const [error, setError] = useState('')

  const submit = () => {
    if (!form.weight || !form.height) {
      setError('Peso y estatura son obligatorios.')
      return
    }
    const n = (key: keyof typeof form) => Number(form[key] || 0)
    onSave({
      date: form.date,
      weight: n('weight'),
      height: n('height'),
      bodyFat: n('bodyFat'),
      waist: n('waist'),
      hip: n('hip'),
      arm: n('arm'),
      armFlexed: n('armFlexed'),
      thigh: n('thigh'),
      calf: n('calf'),
      skinfoldTriceps: n('skinfoldTriceps'),
      skinfoldBiceps: n('skinfoldBiceps'),
      skinfoldSubscapular: n('skinfoldSubscapular'),
      skinfoldIliac: n('skinfoldIliac'),
      skinfoldSupraspinal: n('skinfoldSupraspinal'),
      skinfoldAbdominal: n('skinfoldAbdominal'),
      skinfoldThigh: n('skinfoldThigh'),
      skinfoldCalf: n('skinfoldCalf'),
      diameterWrist: n('diameterWrist'),
      diameterElbow: n('diameterElbow'),
      diameterKnee: n('diameterKnee'),
      notes: form.notes || undefined,
    })
    setError('')
  }

  const num = (key: keyof typeof form, label: string, unit: string) => (
    <Field label={`${label} (${unit})`}>
      <input
        className={inputClass}
        inputMode="decimal"
        value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder="0"
      />
    </Field>
  )

  const section = (title: string, hint: string) => (
    <div className="border-t border-line pt-3 first:border-0 first:pt-0 sm:col-span-3">
      <p className="text-[12.5px] font-semibold">{title}</p>
      <p className="text-[11px] text-muted">{hint}</p>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva medición"
      subtitle="Los valores se guardan crudos; el IMC se calcula al mostrarse"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={submit}>Guardar medición</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fecha">
          <input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        {num('weight', 'Peso', 'kg')}
        {num('height', 'Estatura', 'cm')}
        {num('bodyFat', '% grasa', '%')}
        {!full && num('waist', 'Cintura', 'cm')}
        {!full && num('hip', 'Cadera', 'cm')}

        {!full && (
          <div className="rounded-xl bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-muted sm:col-span-3">
            Plan Básico: se capturan peso, estatura, grasa, cintura y cadera. Las circunferencias
            completas, pliegues, diámetros óseos, el perfil de pérdida y el análisis
            corporal se habilitan con el plan VIP, de $2,000 o más.
          </div>
        )}

        {full && section('Circunferencias', 'Perímetros en centímetros')}
        {full && num('arm', 'Brazo relajado', 'cm')}
        {full && num('armFlexed', 'Brazo flexionado y contraído', 'cm')}
        {full && num('waist', 'Cintura', 'cm')}
        {full && num('hip', 'Cadera', 'cm')}
        {full && num('thigh', 'Muslo', 'cm')}
        {full && num('calf', 'Pantorrilla', 'cm')}

        {full && section('Pliegues cutáneos', 'Pliegues en milímetros')}
        {full && num('skinfoldTriceps', 'Tríceps', 'mm')}
        {full && num('skinfoldBiceps', 'Bíceps', 'mm')}
        {full && num('skinfoldSubscapular', 'Espalda (subescapular)', 'mm')}
        {full && num('skinfoldIliac', 'Cresta iliaca', 'mm')}
        {full && num('skinfoldSupraspinal', 'Supraespinal', 'mm')}
        {full && num('skinfoldAbdominal', 'Abdominal', 'mm')}
        {full && num('skinfoldThigh', 'Muslo medial', 'mm')}
        {full && num('skinfoldCalf', 'Pantorrilla', 'mm')}

        {full && section('Diámetros óseos', 'Diámetros en centímetros')}
        {full && num('diameterWrist', 'Muñeca', 'cm')}
        {full && num('diameterElbow', 'Codo', 'cm')}
        {full && num('diameterKnee', 'Rodilla', 'cm')}

        <Field label="Notas del coach" className="sm:col-span-3">
          <textarea
            className={cx(inputClass, 'min-h-20 resize-y')}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Observaciones, adherencia, cambios de hábitos…"
          />
        </Field>
      </div>
      {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
      <input type="hidden" value={clientId} />
    </Modal>
  )
}

function PaymentModal({
  open, onClose, client, onSave,
}: {
  open: boolean
  onClose: () => void
  client: Client
  onSave: (amount: number, reference: string, date: string, days: number) => void
}) {
  const [amount, setAmount] = useState(String(client.price))
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(todayISO())
  const [months, setMonths] = useState('1')
  // 0.27.10: sin mensualidad definida no se puede derivar a cuántos meses
  // alcanza el monto; se avisa dentro del modal en lugar de fallar en la API.
  const priceMissing = !(client.price > 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar pago"
      subtitle={`${client.name} · transferencia SPEI`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            disabled={priceMissing || !(Number(amount) > 0)}
            onClick={() => onSave(Number(amount), reference, date, Number(months) * 30)}
          >
            Registrar
          </Button>
        </div>
      }
    >
      {priceMissing && (
        <div className="mb-3 rounded-xl bg-warn-soft px-3 py-2.5 text-[11.5px] leading-relaxed text-warn">
          Este cliente no tiene precio mensual definido. Edítalo en su ficha
          (campo Precio) para poder registrar sus pagos.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Meses que cubre" hint="30, 60 o 90 días de membresía.">
          <select
            className={inputClass}
            value={months}
            onChange={(e) => {
              setMonths(e.target.value)
              setAmount(String(client.price * Number(e.target.value)))
            }}
          >
            <option value="1">1 mes · 30 días</option>
            <option value="2">2 meses · 60 días</option>
            <option value="3">3 meses · 90 días</option>
          </select>
        </Field>
        <Field label="Monto (MXN)">
          <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Fecha de transferencia">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Referencia / folio (opcional)" className="sm:col-span-2" hint="Si la dejas vacía se genera una interna. Ayuda a detectar comprobantes repetidos.">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 rounded-xl bg-canvas px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
        El pago queda <strong className="text-ink">pendiente</strong> hasta que un administrador lo apruebe.
        Al aprobarse, la membresía se extiende {Number(months) * 30} días.
      </div>
    </Modal>
  )
}

function EditClientModal({
  open, onClose, client, onSave,
}: {
  open: boolean
  onClose: () => void
  client: Client
  onSave: (patch: Partial<Client>) => void
}) {
  const [form, setForm] = useState({
    name: client.name, phone: client.phone, email: client.email, goal: client.goal,
    sexo: client.sexo ?? 'masculino',
    startDate: client.startDate, endDate: client.endDate, price: String(client.price),
    notes: client.notes ?? '', paused: Boolean(client.paused),
  })
  const [error, setError] = useState('')
  // 0.27.11: bajar de VIP a Básico con los dos apartados (rutina y
  // alimentación) se rechaza — el plan Básico incluye un solo apartado.
  // Se avisa en vivo mientras se captura y al intentar guardar.
  const downgradeConflict =
    Number(form.price) > 0 &&
    Number(form.price) < VIP_PRICE &&
    Boolean(client.routineId) &&
    hasFoodPlan(client)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar ficha"
      subtitle="Los cambios quedan en auditoría"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={() => {
              const price = Number(form.price)
              if (!(price > 0)) {
                setError('La mensualidad debe ser mayor que cero.')
                return
              }
              if (downgradeConflict) {
                setError(
                  'El plan Básico incluye un solo apartado: este cliente tiene rutina y plan de alimentación. Quita uno de los dos antes de bajar la mensualidad, o mantén el precio de VIP.',
                )
                return
              }
              setError('')
              onSave({
                name: form.name, phone: form.phone, email: form.email, goal: form.goal,
                sexo: form.sexo as Client['sexo'],
                startDate: form.startDate, endDate: form.endDate, price: Number(form.price),
                notes: form.notes, paused: form.paused,
              })
            }}
          >
            Guardar cambios
          </Button>
        </div>
      }
    >
      {downgradeConflict && (
        <div className="mb-3 rounded-xl bg-warn-soft px-3 py-2.5 text-[11.5px] leading-relaxed text-warn">
          Al bajar a Básico, este cliente quedaría con rutina y plan de
          alimentación a la vez — el plan Básico solo incluye un apartado.
          Quita uno de los dos en la ficha antes de guardar, o mantén la
          mensualidad en $2,000 (VIP).
        </div>
      )}
      {error && <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Correo">
          <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Objetivo">
          <select className={inputClass} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
            {['Pérdida de grasa', 'Ganancia muscular', 'Recomposición', 'Fuerza', 'Salud general'].map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Sexo" hint="Requerido para las fórmulas antropométricas.">
          <select className={inputClass} value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value as 'masculino' | 'femenino' })}>
            <option value="masculino">Masculino</option>
            <option value="femenino">Femenino</option>
          </select>
        </Field>
        <Field label="Mensualidad (MXN)">
          <input className={inputClass} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" />
        </Field>
        <Field label="Inicio">
          <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Fin">
          <input type="date" className={inputClass} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <textarea className={cx(inputClass, 'min-h-20 resize-y')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
          <input type="checkbox" checked={form.paused} onChange={(e) => setForm({ ...form, paused: e.target.checked })} className="h-4 w-4 accent-[#0e7a63]" />
          Pausar membresía (no cuenta como vencida)
        </label>
      </div>
    </Modal>
  )
}
