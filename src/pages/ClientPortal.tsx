import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, CalendarDays, CalendarX2, Check, ChevronDown, Download, Dumbbell, Eye, EyeOff, Flame, HeartPulse, LogOut,
  MessageCircle, Plus, Printer, ThumbsDown, ThumbsUp, Timer, Trash2, TrendingDown, UserRound,
  UtensilsCrossed, Wallet, X,
} from 'lucide-react'
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bodyComposition, fractionNote, fractionRows } from '../lib/anthro-fraction'
import { somatoNote, somatoRows, somatoType } from '../lib/anthro-somato'
import type { SomatoType } from '../lib/anthro-somato'
import { useApp } from '../store/AppStore'
import {
  apiCreateCheckin, apiCreateExerciseLog, apiExercises, apiMyCheckins, apiMyExerciseLogs,
  apiMyFeedback, apiSetFeedback, exerciseImageUrl, mealPdfUrl,
} from '../lib/api'
import type { AnthroRecord, Exercise, ExerciseCatalogItem, ExerciseFeedback, ExerciseFeeling, ExerciseLog, RoutineCheckin } from '../types'
import { PASSWORD_HINT, passwordProblem } from '../lib/password'
import { resolveCatalogItem } from '../lib/catalog'
import { avatarColor, clientStatus, daysBetween, daysLeft, fmtDate, fmtDateShort, mxn, STATUS_META, todayISO } from '../lib/format'
import { VIP_PRICE, anthroPlanLabel, hasFullAnthro, hasVip } from '../lib/plans'
import { Avatar, Badge, Button, Card, CardHeader, CopyButton, EmptyState, Field, Modal, cx, inputClass } from '../components/ui'
import ThemeToggle from '../components/ThemeToggle'

const TABS = [
  { path: '/mi', label: 'Inicio', icon: Activity },
  { path: '/mi/rutina', label: 'Rutina', icon: Dumbbell },
  { path: '/mi/plan', label: 'Plan', icon: UtensilsCrossed },
  { path: '/mi/progreso', label: 'Progreso', icon: TrendingDown },
]

/**
 * Progreso del cliente en el portal: qué días de la rutina ya completó. La
 * marca se guarda en localStorage SIN fecha de corte: al salir y volver a
 * entrar (o al día siguiente) «Hoy toca» continúa donde se quedó, en lugar de
 * regresar al día 1. El historial de cargas (exercise_logs) respalda el avance:
 * un día con registro de todos sus ejercicios cuenta como completado.
 */
type SessionState = { date: string; completedDays: Record<string, string> }

const SESSION_KEY = 'entrenamiento-sesion'

const readSession = (): SessionState => {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<SessionState> & { completedDayIds?: unknown }) : null
    const today = todayISO()
    // Formato 0.27.12: marca por día con la fecha en que se completó, para
    // poder reiniciar el ciclo cuando todos los días ya se hicieron.
    if (parsed && parsed.completedDays && typeof parsed.completedDays === 'object') {
      const completedDays: Record<string, string> = {}
      for (const [id, date] of Object.entries(parsed.completedDays)) {
        if (typeof date === 'string' && date) completedDays[id] = date
      }
      return { date: today, completedDays }
    }
    // Formato anterior (0.27.11 y previas): arreglo sin fecha. Las marcas se
    // toman como de hoy: el ciclo reinicia en lugar de quedar atorado en el
    // último día (reporte del 16 nov 2026).
    if (parsed && Array.isArray(parsed.completedDayIds)) {
      const completedDays: Record<string, string> = {}
      for (const id of parsed.completedDayIds) {
        if (typeof id === 'string') completedDays[id] = today
      }
      return { date: today, completedDays }
    }
  } catch {
    // Sin storage disponible, el avance vive solo en memoria.
  }
  return { date: todayISO(), completedDays: {} }
}

export default function ClientPortal() {
  const { currentUser, clients, routines, mealPlans, anthro, payments, settings, notify, toast, logout, addAnthro, updateOwnAccount, loadMyPassword, registerPayment } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', date: todayISO() })
  const [payRegistering, setPayRegistering] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountPassword, setAccountPassword] = useState('')
  const [done, setDone] = useState<Set<string>>(new Set())
  const [session, setSession] = useState<SessionState>(readSession)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [logs, setLogs] = useState<ExerciseLog[]>([])
  const [feedback, setFeedback] = useState<ExerciseFeedback[]>([])
  const [checkins, setCheckins] = useState<RoutineCheckin[]>([])
  const [logging, setLogging] = useState<{ dayId: string; exercise: Exercise } | null>(null)
  const [intensityOpen, setIntensityOpen] = useState(false)
  const [viewer, setViewer] = useState<{
    name: string; key: string; catalogId?: string | null; notes?: string | null;
    sets?: number; reps?: string; rest?: string; restSeconds?: number | null; cardio?: boolean; minutes?: number | null;
  } | null>(null)
  // Cronómetro de descanso de la sesión (tarjeta «Hoy toca»): segundos que
  // faltan y total para la barra de progreso. Null = detenido.
  const [restLeft, setRestLeft] = useState<number | null>(null)
  const [restTotal, setRestTotal] = useState(60)

  const loadTraining = useCallback(async () => {
    try {
      const [logData, feedbackData, checkinData] = await Promise.all([
        apiMyExerciseLogs(),
        apiMyFeedback(),
        apiMyCheckins(),
      ])
      setLogs(logData.logs)
      setFeedback(feedbackData.feedback)
      setCheckins(checkinData.checkins)
    } catch {
      // El portal sigue funcionando aunque el seguimiento no responda.
    }
  }, [])

  useEffect(() => {
    void loadTraining()
  }, [loadTraining])

  // El descanso corre solo: cada segundo resta y al llegar a cero avisa.
  useEffect(() => {
    if (restLeft === null) return
    if (restLeft === 0) {
      setRestLeft(null)
      notify('¡Descanso terminado! A la siguiente serie.')
      return
    }
    const id = window.setInterval(() => setRestLeft((s) => (s === null ? null : s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [restLeft, notify])

  const startRest = (seconds: number) => {
    const total = Math.max(1, Math.min(600, seconds))
    setRestTotal(total)
    setRestLeft(total)
  }

  // Biblioteca del coach: instrucciones y foto de cada ejercicio. Se carga al
  // abrir el portal y sirve de respaldo cuando la rutina no trae su propia
  // foto o descripción (p. ej. rutinas creadas antes del vínculo con la
  // biblioteca).
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[] | null>(null)
  useEffect(() => {
    let alive = true
    void apiExercises()
      .then((data) => {
        if (alive) setCatalog(data.exercises)
      })
      .catch(() => {
        // Sin biblioteca, el portal muestra solo lo que trae la rutina.
      })
    return () => { alive = false }
  }, [])

  const client = clients.find((c) => c.id === currentUser?.clientId) ?? clients[0]
  // Regla del plan Básico: el portal solo muestra los apartados incluidos en la
  // mensualidad — rutina o alimentación, nunca los dos. Sin ficha cargada se
  // muestran todas para no ocultar tabs durante la carga.
  const visibleTabs = useMemo(
    () =>
      TABS.filter((t) => {
        if (t.path === '/mi/rutina') return !client || Boolean(client.routineId)
        if (t.path === '/mi/plan') return !client || Boolean(client.mealPlanId || client.mealPdfKey)
        return true
      }),
    [client],
  )
  const coachWa = settings.coachPhone.replace(/\D/g, '')
  const routine = routines.find((r) => r.id === client?.routineId)
  const plan = mealPlans.find((p) => p.id === client?.mealPlanId)
  const fullAnthro = hasFullAnthro(client)
  const vip = hasVip(client)
  const records = useMemo(
    () => anthro.filter((a) => a.clientId === client?.id).sort((a, b) => a.date.localeCompare(b.date)),
    [anthro, client?.id],
  )
  const latest = records[records.length - 1]
  const prev = records[records.length - 2]
  // Perfil de pérdida (0.27.2): fraccionamiento de la medición actual y la
  // previa. Solo alcanza con medición ISAK completa; con Básico queda null.
  const fraction = useMemo(
    () => (client && latest ? bodyComposition(latest, client.sexo) : null),
    [client, latest],
  )
  const fractionPrev = useMemo(
    () => (client && prev ? bodyComposition(prev, client.sexo) : null),
    [client, prev],
  )
  const fractionTable = useMemo(
    () => (fraction ? fractionRows(fraction, fractionPrev) : []),
    [fraction, fractionPrev],
  )
  /** % del peso corporal de cada componente, para la columna Actual. */
  const shareOf: Record<string, number> = fraction
    ? { fat: fraction.fatShare, muscle: fraction.muscleShare, bone: fraction.boneShare, residual: fraction.residualShare }
    : { fat: 0, muscle: 0, bone: 0, residual: 0 }
  // Somatotipo Heath-Carter (0.27.3): misma medición ISAK completa.
  const somato = useMemo(
    () => (client && latest ? somatoType(latest) : null),
    [client, latest],
  )
  const somatoPrev = useMemo(
    () => (client && prev ? somatoType(prev) : null),
    [client, prev],
  )
  const somatoTable = useMemo(
    () => (somato ? somatoRows(somato, somatoPrev) : []),
    [somato, somatoPrev],
  )
  const myPayments = payments.filter((p) => p.clientId === client?.id)
  /** Meses que cubre el monto del pago con la mensualidad del cliente. */
  const payMonths = client ? Math.round((Number(payForm.amount) || 0) / Math.max(1, client.price)) : 0
  const routineLogs = useMemo(
    () => logs.filter((log) => log.routineId === routine?.id),
    [logs, routine?.id],
  )
  // Días completados del ciclo actual (0.27.12): un día cuenta como terminado
  // si en alguna fecha el cliente registró todos sus ejercicios (el cardio
  // basta con un registro) o lo marcó en la sesión guardada; se toma la
  // ÚLTIMA fecha en que eso pasó. Cuando todos los días ya tienen fecha, el
  // ciclo se reinicia: solo cuentan los días rehechos en la fecha del último
  // cierre o después, así «Hoy toca» vuelve al día 1 y el seguimiento del
  // progreso continúa ciclo tras ciclo.
  const doneDayIds = useMemo(() => {
    const done = new Set<string>()
    if (!routine) return done
    // Marca temporal por día: la última vez (timestamp) que ese día se
    // completó entero. Se alimenta del historial de cargas — cada fecha
    // completa aporta el momento de su último registro — y de las marcas de
    // la sesión guardada.
    const lastDoneAt = new Map<string, string>()
    const namesByDate = new Map<string, Set<string>>()
    const lastLogAtByDate = new Map<string, string>()
    for (const log of routineLogs) {
      const names = namesByDate.get(log.date) ?? new Set<string>()
      names.add(log.exerciseName.toLowerCase())
      namesByDate.set(log.date, names)
      const prev = lastLogAtByDate.get(log.date)
      if (!prev || log.createdAt > prev) lastLogAtByDate.set(log.date, log.createdAt)
    }
    const consider = (dayId: string, at: string) => {
      const prev = lastDoneAt.get(dayId)
      if (!prev || at > prev) lastDoneAt.set(dayId, at)
    }
    for (const day of routine.days) {
      if (day.exercises.length === 0) continue
      for (const [date, names] of namesByDate) {
        if (day.exercises.every((ex) => names.has(ex.name.toLowerCase()))) {
          consider(day.id, lastLogAtByDate.get(date) ?? date)
        }
      }
    }
    for (const [dayId, at] of Object.entries(session.completedDays)) {
      if (routine.days.some((d) => d.id === dayId && d.exercises.length > 0)) consider(dayId, at)
    }
    const activeDays = routine.days.filter((d) => d.exercises.length > 0)
    if (activeDays.length === 0) return done
    // Primer ciclo: avanzan los días que ya se completaron alguna vez.
    if (!activeDays.every((d) => lastDoneAt.has(d.id))) {
      for (const d of activeDays) if (lastDoneAt.has(d.id)) done.add(d.id)
      return done
    }
    // Ciclo cerrado: solo avanza el día rehecho más reciente; así «Hoy
    // toca» regresa al día 1 y sigue el orden con cada nuevo entrenamiento.
    const cycleStart = [...lastDoneAt.values()].reduce((a, b) => (a > b ? a : b))
    for (const d of activeDays) {
      if ((lastDoneAt.get(d.id) ?? '') >= cycleStart) done.add(d.id)
    }
    return done
  }, [routine, routineLogs, session.completedDays])
  // Resuelve un ejercicio de la rutina contra la biblioteca: primero por su
  // enlace (catalogId) y luego por nombre (rutinas sin enlace).
  const guideFor = (name: string, catalogId?: string | null) =>
    catalog ? resolveCatalogItem(catalog, name, catalogId) : undefined
  // Foto a mostrar: la propia del renglón de la rutina o, si no tiene, la de
  // la biblioteca — así las fotos nuevas del catálogo se ven en rutinas viejas.
  const imageKeyFor = (ex: { name: string; imageKey?: string | null; catalogId?: string | null }) =>
    ex.imageKey ?? guideFor(ex.name, ex.catalogId)?.imageKey ?? null

  // 0.27.13: si la mensualidad está vencida, el registro de pago arranca con
  // la mensualidad del cliente ya capturada, lista para registrar.
  const expiredNow = client ? clientStatus(client) === 'vencido' : false
  useEffect(() => {
    if (expiredNow && client && payForm.amount === '') {
      setPayForm({ amount: String(client.price), date: todayISO() })
    }
  }, [expiredNow, client, payForm.amount])

  if (!client) return <EmptyState title="Sin ficha vinculada" description="Pide a tu coach que vincule tu cuenta." />

  // 0.27.13: forma de pago reutilizada — dentro del modal «Cómo pagar» y en
  // la ventana de pago que se abre desde el mensaje de suscripción vencida.
  const payPanel = (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-canvas p-3">
        <p className="text-[10.5px] uppercase tracking-wider text-muted">Banco</p>
        <p className="text-[13.5px] font-medium">{settings.bank}</p>
      </div>
      <div className="rounded-xl bg-canvas p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] uppercase tracking-wider text-muted">CLABE</p>
            <p className="font-mono text-[13px] font-medium break-all">{settings.clabe}</p>
          </div>
          <CopyButton value={settings.clabe} label="CLABE" withText />
        </div>
      </div>
      {settings.bank2 && (
        <div className="rounded-xl bg-canvas p-3">
          <p className="text-[10.5px] uppercase tracking-wider text-muted">Banco 2</p>
          <p className="text-[13.5px] font-medium">{settings.bank2}</p>
        </div>
      )}
      {settings.clabe2 && (
        <div className="rounded-xl bg-canvas p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] uppercase tracking-wider text-muted">CLABE 2</p>
              <p className="font-mono text-[13px] font-medium break-all">{settings.clabe2}</p>
            </div>
            <CopyButton value={settings.clabe2} label="CLABE 2" withText />
          </div>
        </div>
      )}
      <div className="rounded-xl bg-canvas p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] uppercase tracking-wider text-muted">Alias</p>
            <p className="font-mono text-[13px] font-medium">{settings.alias}</p>
          </div>
          <CopyButton value={settings.alias} label="alias" />
        </div>
      </div>
      {/* Registro de pago por el propio cliente (0.27.1): sin referencia.
          El pago queda pendiente hasta que el administrador lo apruebe. */}
      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Registra tu pago</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="Monto (MXN)">
            <input
              className={inputClass}
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              inputMode="decimal"
              placeholder={String(client.price)}
            />
          </Field>
          <Field label="Fecha">
            <input
              type="date"
              className={inputClass}
              value={payForm.date}
              onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
            />
          </Field>
        </div>
        <p className="mt-1 text-[10.5px] text-muted">
          {payMonths >= 1
            ? `Cubre ${payMonths} ${payMonths === 1 ? 'mes' : 'meses'} · ${payMonths * 30} días a ${mxn(client.price)}/mes.`
            : `Con tu mensualidad de ${mxn(client.price)}, el monto debe cubrir al menos un mes.`}
        </p>
        <Button
          className="mt-2 w-full"
          size="sm"
          disabled={payMonths < 1 || payRegistering}
          onClick={async () => {
            setPayRegistering(true)
            const res = await registerPayment({
              clientId: client.id,
              amount: Number(payForm.amount),
              date: payForm.date,
              days: payMonths * 30,
            })
            setPayRegistering(false)
            if (!res.ok) { notify(res.error ?? 'No se pudo registrar el pago', 'warn'); return }
            notify('Pago registrado · queda pendiente de aprobación')
          }}
        >
          Registrar mi pago
        </Button>
      </div>
      <p className="text-[11.5px] leading-relaxed text-muted">
        Si prefieres, envía tu comprobante por WhatsApp y tu coach lo registra
        por ti. Todo pago queda pendiente hasta que el administrador lo apruebe.
      </p>
      {coachWa && (
        <a
          href={`https://wa.me/52${coachWa}?text=${encodeURIComponent('Hola, envío mi comprobante de pago.')}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-[12.5px] font-medium text-brand"
        >
          <MessageCircle size={15} /> Enviar comprobante a mi coach
        </a>
      )}
      {myPayments.length > 0 && (
        <div className="border-t border-line pt-2">
          <p className="text-[11px] font-medium">Último pago</p>
          <p className="text-[11.5px] text-muted">{fmtDate(myPayments[0].date)} · {mxn(myPayments[0].amount)} · {myPayments[0].status}</p>
        </div>
      )}
    </div>
  )

  // Mensualidad vencida (0.27.13): el portal se limita a la pantalla de pago
  // para reactivar el plan — sin inicio, rutina, alimentación, progreso ni
  // cuenta. Todos los apartados regresan cuando el administrador aprueba el
  // pago y la ficha vuelve a estar vigente.
  if (clientStatus(client) === 'vencido') {
    return (
      <div className="min-h-dvh bg-canvas">
        <div className="mx-auto min-h-dvh w-full max-w-lg bg-canvas pb-10 shadow-xl shadow-black/5 lg:max-w-2xl lg:shadow-none">
          <header className="border-b border-line bg-canvas/95 px-4 pb-3 pt-4 backdrop-blur lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
                  <Activity size={16} strokeWidth={2.5} />
                </span>
                <div>
                  <p className="text-[13px] font-semibold leading-tight">Entrenamiento</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Tu plan diario</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Avatar name={client.name} color={avatarColor(client.id)} size="sm" />
                <button
                  onClick={() => {
                    logout()
                    navigate('/login')
                  }}
                  className="rounded-lg border border-line bg-surface p-1.5 text-muted"
                  aria-label="Salir"
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          </header>

          <main className="flex min-h-[62dvh] flex-col items-center justify-center px-4 py-10 text-center lg:px-8">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-danger-soft text-danger">
              <CalendarX2 size={26} />
            </span>
            <span className="mt-3 rounded-full bg-danger-soft px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-danger">
              Suscripción terminada
            </span>
            <h1 className="mt-3 text-[24px] font-semibold tracking-tight lg:text-[28px]">
              Tu plan quedó en pausa
            </h1>
            <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
              Tu mensualidad llegó a su fecha el{' '}
              <span className="font-medium text-ink">{fmtDate(client.endDate)}</span>, así que
              tu plan está tomándose una pequeña pausa. Tranquilo: tu avance
              sigue guardado y en cuanto quieras continuar, todo te espera
              igual que lo dejaste.
            </p>
            <Button
              className="mt-5"
              onClick={() => setPayOpen(true)}
            >
              <Wallet size={15} /> Ver datos para pagar
            </Button>
            <p className="mt-2 text-[11px] text-muted">
              {mxn(client.price)} / mes · transferencia SPEI sin comisiones
            </p>
          </main>
        </div>

        <Modal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          title="Reactiva tu plan"
          subtitle={`${mxn(client.price)} / mes · tu pago queda pendiente de aprobación`}
          footer={<Button className="w-full" onClick={() => setPayOpen(false)}>Entendido</Button>}
        >
          {payPanel}
        </Modal>
      </div>
    )
  }

  const status = clientStatus(client)
  const left = daysLeft(client.endDate)
  // La barra de la membresía cuenta el ciclo pagado vigente (0.27.13): tras
  // una renovación aprobada, el ciclo arranca en la fecha de esa renovación,
  // no en el alta original — así un mes recién pagido no aparece medio consumido.
  const cycleStart = client.cycleStart ?? client.startDate
  const total = Math.max(1, daysBetween(cycleStart, client.endDate))
  const elapsed = Math.max(0, Math.min(total, total - left))
  // «Hoy toca» es dinámico: muestra el primer día de la rutina que aún no se
  // completa (por historial de cargas o por marca guardada); al terminar un
  // día, el panel avanza al siguiente. Al completar TODOS los días el ciclo
  // se reinicia y vuelve al día 1 (0.27.12), para continuar el seguimiento.
  const today = routine
    ? routine.days.find((d) => !doneDayIds.has(d.id)) ??
      routine.days.find((d) => d.exercises.length > 0) ??
      routine.days[0]
    : undefined
  const allDaysDone = Boolean(
    routine && routine.days.length > 0 && routine.days.every((d) => doneDayIds.has(d.id)),
  )
  // Fecha larga para el encabezado de «Hoy toca» («Martes 11 de noviembre»).
  const todayLabel = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  const todayLong = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)
  // Intensidad ya registrada hoy, para el pie de la tarjeta.
  const todayIntensity = checkins.find((checkin) => checkin.date === todayISO())?.intensity
  // Descanso por defecto del día: el del primer ejercicio de fuerza; 60 s si
  // el día es solo cardio o no trae descanso definido.
  const dayRestSeconds =
    today?.exercises.find((ex) => !ex.cardio)?.restSeconds ??
    (Number.parseInt(today?.exercises.find((ex) => !ex.cardio)?.rest ?? '', 10) || 60)

  const lastLogFor = (name: string) =>
    routineLogs.find((log) => log.exerciseName.toLowerCase() === name.toLowerCase())

  const bestWeightFor = (name: string) =>
    Math.max(
      0,
      ...routineLogs
        .filter((log) => log.exerciseName.toLowerCase() === name.toLowerCase())
        .flatMap((log) => log.sets.map((set) => set.weight ?? 0)),
    )

  // Series registradas HOY para un ejercicio: alimenta el número del círculo
  // en «Hoy toca», igual que la vista previa de la portada.
  const setsDoneTodayFor = (name: string) =>
    logs
      .filter(
        (log) =>
          log.date === todayISO() && log.routineId === routine?.id &&
          log.exerciseName.toLowerCase() === name.toLowerCase(),
      )
      .reduce((sum, log) => sum + log.sets.length, 0)

  // Última carga máxima registrada para el ejercicio (se muestra a la derecha).
  const lastLoadFor = (name: string) => {
    const log = lastLogFor(name)
    return log ? Math.max(0, ...log.sets.map((set) => set.weight ?? 0)) : 0
  }

  const feedbackFor = (name: string): ExerciseFeeling | undefined =>
    feedback.find(
      (item) => item.routineId === routine?.id && item.exerciseName.toLowerCase() === name.toLowerCase(),
    )?.value

  const toggleFeedback = async (name: string, value: ExerciseFeeling) => {
    if (!routine) return
    const current = feedbackFor(name)
    const next = current === value ? null : value
    try {
      await apiSetFeedback(routine.id, name, next)
      setFeedback((items) => {
        const rest = items.filter(
          (item) => !(item.routineId === routine.id && item.exerciseName.toLowerCase() === name.toLowerCase()),
        )
        return next
          ? [...rest, { routineId: routine.id, exerciseName: name, value: next, updatedAt: new Date().toISOString() }]
          : rest
      })
      notify(next === 'like' ? 'Te gusta este ejercicio' : next === 'dislike' ? 'Marcaste que no te gusta' : 'Reacción eliminada')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo guardar tu reacción.', 'warn')
    }
  }

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

  const toggleExercise = (id: string) => {
    const next = new Set(done)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDone(next)
    const day = routine?.days.find((d) => d.exercises.some((e) => e.id === id))
    if (day && day.exercises.length > 0 && day.exercises.every((e) => next.has(e.id))) {
      // Día completado: la marca guarda la fecha en que se hizo, así el
      // ciclo puede reiniciarse cuando todos los días ya se completaron y
      // «Hoy toca» avanza (o vuelve al día 1) al salir y volver a entrar.
      const nextSession: SessionState = {
        date: todayISO(),
        completedDays: { ...session.completedDays, [day.id]: new Date().toISOString() },
      }
      setSession(nextSession)
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession))
      } catch {
        // Sin storage el avance vive solo en memoria.
      }
      // El día termina en silencio: sin alerta, el panel pasa al siguiente
      // día y las casillas empiezan limpias (también al reiniciar el ciclo,
      // porque los ejercicios repiten sus ids vuelta tras vuelta).
      setDone(new Set())
    }
  }

  // La pestaña activa se resuelve contra TODAS las rutas: una URL directa a un
  // apartado no incluido sigue renderizando su contenido (la regla del Básico
  // oculta el acceso en el nav, la API es la fuente de verdad).
  const tab = TABS.find((t) => t.path === location.pathname) ?? TABS[0]

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto min-h-dvh w-full max-w-lg bg-canvas pb-24 shadow-xl shadow-black/5 lg:max-w-6xl lg:pb-10 lg:shadow-none">
        {/* Encabezado */}
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 pb-3 pt-4 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
                <Activity size={16} strokeWidth={2.5} />
              </span>
              <div>
                <p className="text-[13px] font-semibold leading-tight">Entrenamiento</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Tu plan diario</p>
              </div>
            </div>
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Secciones del portal">
              {visibleTabs.map((t) => {
                const active = location.pathname === t.path
                return (
                  <button
                    key={t.path}
                    onClick={() => navigate(t.path)}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors',
                      active ? 'bg-brand-soft text-brand-dark' : 'text-muted hover:bg-canvas hover:text-ink',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <t.icon size={15} />
                    {t.label}
                  </button>
                )
              })}
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Avatar name={client.name} color={avatarColor(client.id)} size="sm" />
              <button
                onClick={() => {
                  setAccountOpen(true)
                  void loadMyPassword().then((value) => setAccountPassword(value ?? ''))
                }}
                className="rounded-lg border border-line bg-surface p-1.5 text-muted"
                aria-label="Mi cuenta"
              >
                <UserRound size={14} />
              </button>
              <button
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
                className="rounded-lg border border-line bg-surface p-1.5 text-muted"
                aria-label="Salir"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 pt-4 lg:px-8 lg:pt-8">
          {tab.path === '/mi' && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="mt-1 text-[24px] font-semibold tracking-tight lg:text-[30px]">
                Hola, {client.name.split(' ')[0]}
              </h1>
              <p className="mt-0.5 text-[13px] text-muted">Este es tu resumen de hoy.</p>

              <div className="lg:mt-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
              <div className="lg:col-span-7">
              <Card className="mt-4 overflow-hidden">
                <div className="bg-[#2a1417] px-4 py-4 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10.5px] uppercase tracking-[0.16em] text-white/50">Tu membresía</p>
                      <p className="mt-1 text-[19px] font-semibold">
                        {left < 0 ? 'Vencida' : `${left} días restantes`}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-white/60">Vence el {fmtDate(client.endDate)}</p>
                    </div>
                    <Badge tone={left < 0 ? 'danger' : left <= 7 ? 'warn' : 'brand'}>{STATUS_META[status].label}</Badge>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-[#f4a6ad]" style={{ width: `${(elapsed / total) * 100}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[11.5px] text-white/70">{mxn(client.price)} / mes</p>
                    <button onClick={() => { setPayForm({ amount: String(client.price), date: todayISO() }); setPayOpen(true) }} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11.5px] font-medium ring-1 ring-white/15">
                      <Wallet size={12} /> Cómo pagar
                    </button>
                  </div>
                </div>
              </Card>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: 'Peso', value: latest ? `${latest.weight} kg` : '—', diff: latest && prev ? latest.weight - prev.weight : 0 },
                  { label: '% grasa', value: latest && latest.bodyFat ? `${latest.bodyFat}%` : '—', diff: latest && prev && latest.bodyFat && prev.bodyFat ? latest.bodyFat - prev.bodyFat : 0 },
                  { label: 'Adherencia', value: `${client.adherence}%`, diff: 0 },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-line bg-surface px-3 py-2.5">
                    <p className="text-[10px] text-muted">{m.label}</p>
                    <p className="mt-0.5 text-[14px] font-semibold">{m.value}</p>
                    {m.diff !== 0 && (
                      <p className={cx('text-[10px]', m.diff < 0 ? 'text-brand' : 'text-warn')}>
                        {m.diff > 0 ? '+' : ''}{m.diff.toFixed(1)}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <Button variant="secondary" className="mt-2 w-full" onClick={() => setWeightOpen(true)}>
                <Plus size={15} /> Registrar mi peso
              </Button>

              {/* Hoy toca: solo si el cliente tiene rutina asignada (regla Básico).
                  Réplica de la tarjeta de la portada: encabezado HOY con fecha,
                  renglones con series hechas, descanso con barra e intensidad. */}
              {routine && (
              <Card className="mt-4 overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                    <span className="rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">HOY</span>
                    {todayLong}
                  </p>
                  <button onClick={() => navigate('/mi/rutina')} className="text-[11.5px] font-medium text-brand">
                    Ver todo
                  </button>
                </div>

                <div className="px-4 pt-4">
                  <p className="text-[11px] font-semibold text-muted">
                    {allDaysDone
                      ? 'Rutina completa, a descansar'
                      : today?.name || 'Entrenamiento del día'}
                  </p>
                </div>
                {doneDayIds.size > 0 && !allDaysDone && (
                  <p className="flex items-center gap-1.5 px-4 pt-2 text-[11px] text-muted">
                    <Check size={12} className="text-brand" />
                    Ya completaste {doneDayIds.size === 1 ? 'un día' : `${doneDayIds.size} días`} — este es el que sigue.
                  </p>
                )}

                <ul className="px-4 pb-1 pt-2">
                  {(today?.exercises ?? [])
                    .slice()
                    .sort((a, b) => Number(b.cardio ?? false) - Number(a.cardio ?? false))
                    .map((ex, index, list) => {
                      const previous = list[index - 1]
                      const startsCardioGroup = ex.cardio && !(previous?.cardio ?? false)
                      const setsToday = setsDoneTodayFor(ex.name)
                      const complete = done.has(ex.id) || (!ex.cardio && ex.sets > 0 && setsToday >= ex.sets)
                      const load = lastLoadFor(ex.name)
                      const imageKey = imageKeyFor(ex)
                      return (
                        <Fragment key={ex.id}>
                          {startsCardioGroup && (
                            <li className="pt-1.5">
                              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warn">
                                <HeartPulse size={11} /> Cardio
                              </p>
                            </li>
                          )}
                          <li className="flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0">
                            <button
                              onClick={() => toggleExercise(ex.id)}
                              aria-label={done.has(ex.id) ? `Desmarcar ${ex.name}` : `Marcar ${ex.name} como hecho`}
                              aria-pressed={done.has(ex.id)}
                              className={cx(
                                'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                                complete ? 'bg-brand text-white' : 'border border-line text-muted',
                              )}
                            >
                              {complete ? <Check size={12} strokeWidth={3} /> : setsToday}
                            </button>
                            <span className={cx('min-w-0 flex-1 truncate text-[13px]', complete ? 'text-muted line-through decoration-line' : 'text-ink')}>
                              {ex.name}
                            </span>
                            {imageKey && (
                              <button
                                onClick={() => setViewer({ name: ex.name, key: imageKey, catalogId: ex.catalogId, notes: ex.notes, sets: ex.sets, reps: ex.reps, rest: ex.rest, restSeconds: ex.restSeconds, cardio: ex.cardio, minutes: ex.minutes })}
                                className="shrink-0"
                                aria-label={`Ver foto de ${ex.name}`}
                              >
                                <img
                                  src={exerciseImageUrl(imageKey)}
                                  alt={`Foto de ${ex.name}`}
                                  className="h-8 w-8 rounded-md border border-line object-cover"
                                />
                              </button>
                            )}
                            <span className="shrink-0 text-right text-[12.5px] tabular-nums">
                              {ex.cardio ? (
                                <span className="text-muted">{ex.minutes ?? 20} min</span>
                              ) : (
                                <>
                                  <span className="font-semibold text-ink">{ex.sets}×{ex.reps}</span>
                                  {load > 0 && <span className="ml-1.5 text-muted">{load.toFixed(1)} kg</span>}
                                </>
                              )}
                            </span>
                          </li>
                        </Fragment>
                      )
                    })}
                  {!today && <li className="py-2 text-[12px] text-muted">Tu coach aún no te asigna una rutina.</li>}
                </ul>

                {/* Descanso: cronómetro con barra de progreso, como en la portada.
                    Corriendo muestra los dos controles: detener y reiniciar. */}
                <div className="mx-4 mb-4 mt-2 rounded-xl bg-sand px-4 py-3">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <p className="shrink-0 font-medium text-ink">Descanso</p>
                    {restLeft === null ? (
                      <button
                        onClick={() => startRest(dayRestSeconds)}
                        className="text-[11.5px] font-semibold text-brand"
                        aria-label="Iniciar descanso"
                      >
                        Iniciar {dayRestSeconds} s
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold tabular-nums text-ink">
                          {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}
                        </p>
                        <button
                          onClick={() => {
                            setRestLeft(null)
                            notify('Descanso detenido.')
                          }}
                          className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:text-ink"
                          aria-label="Detener descanso"
                        >
                          Detener
                        </button>
                        <button
                          onClick={() => setRestLeft(restTotal)}
                          className="rounded-md bg-brand px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-dark"
                          aria-label="Reiniciar descanso"
                        >
                          Reiniciar
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-linear"
                      style={{ width: restLeft === null ? '0%' : `${(restLeft / restTotal) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-line px-4 py-3">
                  <p className="text-[11.5px] text-muted">Intensidad de hoy</p>
                  {todayIntensity !== undefined ? (
                    <p className="text-[12px] font-semibold tabular-nums text-brand">{todayIntensity} / 10</p>
                  ) : (
                    <button onClick={() => setIntensityOpen(true)} className="text-[11.5px] font-semibold text-brand">
                      Registrar
                    </button>
                  )}
                </div>
              </Card>
              )}
              </div>

              <div className="lg:col-span-5">
              {/* Tu plan de hoy: solo si el cliente tiene plan o PDF (regla Básico). */}
              {(plan || client?.mealPdfKey) && (
              <Card className="mt-4">
                <CardHeader
                  title="Tu plan de hoy"
                  subtitle={plan ? `${plan.kcal} kcal · ${plan.protein} g de proteína` : 'Sin plan asignado'}
                  action={
                    <span className="flex items-center gap-2.5">
                      {client?.mealPdfKey && (
                        <a href={mealPdfUrl(client.mealPdfKey)} target="_blank" rel="noreferrer" className="text-[11.5px] font-medium text-brand">
                          Ver PDF
                        </a>
                      )}
                      <button onClick={() => navigate('/mi/plan')} className="text-[11.5px] font-medium text-brand">Ver plan</button>
                    </span>
                  }
                />
                <div className="px-4 pb-4">
                  {plan ? (
                    <div className="flex flex-wrap gap-1.5">
                      {plan.meals.map((m) => (
                        <Badge key={m.id} tone="neutral">{m.slot}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted">Tu plan de hoy está en el PDF (botón «Ver PDF»).</p>
                  )}
                </div>
              </Card>
              )}

              {coachWa && (
                <a
                  href={`https://wa.me/52${coachWa}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-3 text-[12.5px] font-medium text-brand"
                >
                  <MessageCircle size={15} /> Escribir a mi coach
                </a>
              )}
              </div>
              </div>
            </>
          )}

          {tab.path === '/mi/rutina' && (
            <>
              <h1 className="text-[22px] font-semibold tracking-tight lg:text-[28px]">Mi rutina</h1>
              <p className="mt-0.5 text-[12.5px] text-muted">{routine ? `${routine.name} · ${routine.weeks} semanas` : 'Sin rutina asignada'}</p>

              {!routine ? (
                <Card className="mt-4"><EmptyState title="Sin rutina" description="Este apartado no está incluido en tu mensualidad actual." /></Card>
              ) : (
                <div className="mt-4 space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
                  {routine.days.map((day) => (
                    <Card key={day.id} className="overflow-hidden">
                      <button
                        onClick={() => setOpenDay(openDay === day.id ? null : day.id)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                      >
                        <div>
                          <p className="text-[13.5px] font-semibold">{day.name}</p>
                          <p className="text-[11px] text-muted">{day.focus} · {day.exercises.length} ejercicios</p>
                        </div>
                        <ChevronDown size={16} className={cx('text-muted transition-transform', openDay === day.id && 'rotate-180')} />
                      </button>
                      {openDay === day.id && (
                        <div className="space-y-1.5 border-t border-line bg-canvas/40 px-4 py-3">
                          {day.exercises
                            .slice()
                            .sort((a, b) => Number(b.cardio ?? false) - Number(a.cardio ?? false))
                            .map((ex, index, list) => {
                              const previous = list[index - 1]
                              const startsCardioGroup = ex.cardio && !(previous?.cardio ?? false)
                              const last = lastLogFor(ex.name)
                              const best = bestWeightFor(ex.name)
                              const feeling = feedbackFor(ex.name)
                              const imageKey = imageKeyFor(ex)
                              return (
                                <Fragment key={ex.id}>
                                  {startsCardioGroup && (
                                    <p className="flex items-center gap-1.5 px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warn">
                                      <HeartPulse size={11} /> Cardio · al terminar el día
                                    </p>
                                  )}
                              <div
                                className={cx('rounded-lg px-2 py-2', done.has(ex.id) ? 'bg-brand-soft/70' : 'bg-surface')}
                              >
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => toggleExercise(ex.id)}
                                    className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border', done.has(ex.id) ? 'border-brand bg-brand text-white' : 'border-line text-transparent')}
                                    aria-label={done.has(ex.id) ? `Desmarcar ${ex.name}` : `Marcar ${ex.name} como hecho`}
                                  >
                                    <Check size={11} strokeWidth={3} />
                                  </button>
                                  <span className="min-w-0 flex-1 text-[12px]">{ex.name}</span>
                                  {imageKey && (
                                    <button
                                      onClick={() => setViewer({ name: ex.name, key: imageKey, catalogId: ex.catalogId, notes: ex.notes, sets: ex.sets, reps: ex.reps, rest: ex.rest, restSeconds: ex.restSeconds, cardio: ex.cardio, minutes: ex.minutes })}
                                      className="shrink-0"
                                      aria-label={`Ver foto de ${ex.name}`}
                                    >
                                      <img
                                        src={exerciseImageUrl(imageKey)}
                                        alt={`Foto de ${ex.name}`}
                                        className="h-8 w-8 rounded-md border border-line object-cover"
                                      />
                                    </button>
                                  )}
                                  <span className="shrink-0 text-[10.5px] text-muted">
                                    {ex.cardio ? `${ex.minutes ?? 20} min de cardio` : `${ex.sets} × ${ex.reps} · ${ex.rest}`}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 pl-7">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => void toggleFeedback(ex.name, 'like')}
                                      aria-label={`Me gusta ${ex.name}`}
                                      aria-pressed={feeling === 'like'}
                                      className={cx(
                                        'rounded-md p-1 transition-colors',
                                        feeling === 'like' ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink',
                                      )}
                                    >
                                      <ThumbsUp size={13} />
                                    </button>
                                    <button
                                      onClick={() => void toggleFeedback(ex.name, 'dislike')}
                                      aria-label={`No me gusta ${ex.name}`}
                                      aria-pressed={feeling === 'dislike'}
                                      className={cx(
                                        'rounded-md p-1 transition-colors',
                                        feeling === 'dislike' ? 'bg-warn/10 text-warn' : 'text-muted hover:text-ink',
                                      )}
                                    >
                                      <ThumbsDown size={13} />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {ex.cardio ? (
                                      <span className="text-[10px] text-muted">Cardio: marca al terminar tus minutos</span>
                                    ) : (
                                      <>
                                        <span className="text-[10px] text-muted">
                                          {last
                                            ? `Último: ${last.sets.length} series${best > 0 ? ` · máx ${best} kg` : ''}`
                                            : 'Sin cargas registradas'}
                                        </span>
                                        <button
                                          onClick={() => setLogging({ dayId: day.id, exercise: ex })}
                                          aria-label={`Registrar carga de ${ex.name}`}
                                          className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[10.5px] font-semibold text-white"
                                        >
                                          <Plus size={11} /> Carga
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                                </Fragment>
                              )
                            })}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
              <p className="mt-3 px-1 text-[10.5px] leading-relaxed text-muted">
                Marca cada ejercicio al terminarlo. Registra tus cargas con el botón <strong>Carga</strong>;
                el cardio se marca al terminar tus minutos; el temporizador usa el descanso que indicó tu coach
                y tu reacción con 👍/👎 le llega al coach.
              </p>
            </>
          )}

          {tab.path === '/mi/plan' && (
            <>
              <h1 className="text-[22px] font-semibold tracking-tight lg:text-[28px]">Mi alimentación</h1>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {plan ? plan.name : client?.mealPdfKey ? 'Plan en PDF de tu coach' : 'Sin plan asignado'}
              </p>

              {/* Plan en PDF (0.27.10): tarjeta con Ver y Descargar. El visor
                  integrado se retiró: el navegador bloquea incrustar el PDF
                  (X-Frame-Options en la respuesta del archivo). */}
              {client?.mealPdfKey && (
                <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium">Tu plan en PDF</p>
                    <p className="truncate text-[11px] text-muted">
                      {client.mealPdfName} · actualizado {fmtDate(client.mealPdfUpdatedAt ?? '')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <a href={mealPdfUrl(client.mealPdfKey)} target="_blank" rel="noreferrer">
                      <Button size="sm"><Eye size={14} /> Ver</Button>
                    </a>
                    <a href={mealPdfUrl(client.mealPdfKey)} download={client.mealPdfName ?? 'plan.pdf'}>
                      <Button size="sm" variant="secondary"><Download size={14} /> Descargar</Button>
                    </a>
                  </div>
                </Card>
              )}

              {plan && (
                <>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {[
                      ['kcal', plan.kcal], ['P', plan.protein], ['C', plan.carbs], ['G', plan.fat],
                    ].map(([l, v]) => (
                      <div key={l as string} className="rounded-xl border border-line bg-surface px-2 py-2 text-center">
                        <p className="text-[10px] text-muted">{l}</p>
                        <p className="text-[14px] font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
                    {plan.meals.map((meal) => (
                      <Card key={meal.id} className="p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">{meal.slot}</p>
                        <ul className="mt-1.5 space-y-1">
                          {meal.items.map((i) => (
                            <li key={i.id} className="flex justify-between gap-3 text-[12.5px]">
                              <span>{i.food}</span>
                              <span className="text-muted">{i.qty}</span>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    ))}
                  </div>

                  <Button variant="secondary" className="mt-3 w-full lg:w-auto" onClick={() => window.print()}>
                    <Printer size={15} /> Guardar como PDF
                  </Button>
                </>
              )}
            </>
          )}

          {tab.path === '/mi/progreso' && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-[22px] font-semibold tracking-tight lg:text-[28px]">Mi progreso</h1>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                    {records.length} mediciones · tú y tu coach pueden registrar
                    <Badge tone={fullAnthro ? 'brand' : 'neutral'}>{anthroPlanLabel(client)}</Badge>
                  </p>
                  {!vip && (
                    <p className="mt-1 text-[10.5px] text-muted">
                      La medición completa y el perfil de pérdida (fraccionamiento
                      corporal y somatotipo) se habilitan con el plan VIP, de
                      ${VIP_PRICE.toLocaleString('es-MX')} o más.
                    </p>
                  )}
                </div>
                <Button size="sm" variant="soft" onClick={() => setWeightOpen(true)}>
                  <Plus size={14} /> Mi peso
                </Button>
              </div>

              <Card className="mt-4 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <Flame size={14} className="text-brand" /> Intensidad del mes
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {routine ? routine.name : 'Sin rutina'} · 1 = ligera, 10 = demoledora
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="soft"
                    aria-label="Registrar intensidad de hoy"
                    onClick={() => setIntensityOpen(true)}
                    disabled={!routine}
                  >
                    <Plus size={14} /> Registrar
                  </Button>
                </div>
                {intensityData.length === 0 ? (
                  <p className="mt-4 rounded-xl bg-canvas px-3 py-4 text-center text-[11.5px] text-muted">
                    Aún no registras intensidad este mes.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 h-[150px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={intensityData}>
                          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                          <YAxis domain={[0, 10]} ticks={[1, 5, 10]} width={20} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                          <Tooltip formatter={(v) => [`${v}/10`, 'Intensidad']} contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 12 }} />
                          <Bar dataKey="intensity" fill="var(--color-brand)" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] text-muted">
                      Promedio del mes: {averageIntensity.toFixed(1)}/10 · {monthCheckins.length} sesión(es)
                    </p>
                  </>
                )}
              </Card>

              <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
              <Card className="mt-3 overflow-hidden">
                <CardHeader title="Mis cargas" subtitle="Últimos registros de tu rutina" />
                {routineLogs.length === 0 ? (
                  <p className="px-4 pb-4 text-[11.5px] text-muted">
                    Registra una carga desde <strong>Rutina</strong> para empezar tu historial.
                  </p>
                ) : (
                  <div className="divide-y divide-line border-t border-line">
                    {routineLogs.slice(0, 5).map((log) => (
                      <div key={log.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="font-medium">{log.exerciseName}</span>
                          <span className="text-muted">{fmtDate(log.date)}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {log.sets.map((set) => `${set.weight ?? '—'} kg × ${set.reps}`).join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {records.length === 0 ? (
                <Card className="mt-4">
                  <EmptyState
                    title="Sin mediciones"
                    description="Registra tu peso para empezar a ver tu evolución."
                    action={<Button size="sm" onClick={() => setWeightOpen(true)}>Registrar mi peso</Button>}
                  />
                </Card>
              ) : (
                <>
                  <Card className="mt-4 p-4">
                    <div className="mb-3 flex items-baseline justify-between">
                      <p className="text-[13px] font-semibold">Peso</p>
                      {latest && prev && (
                        <Badge tone={latest.weight <= prev.weight ? 'brand' : 'warn'}>
                          {latest.weight > prev.weight ? '+' : ''}{(latest.weight - prev.weight).toFixed(1)} kg
                        </Badge>
                      )}
                    </div>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={records.map((r) => ({ ...r, label: fmtDateShort(r.date) }))}>
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                          <YAxis domain={['dataMin - 2', 'dataMax + 2']} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                          <Tooltip formatter={(v) => [`${v} kg`, 'Peso']} contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 12 }} />
                          <Line type="monotone" dataKey="weight" stroke="var(--color-brand)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--color-brand)' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ['Peso actual', `${latest?.weight} kg`],
                      ['% grasa', `${latest?.bodyFat}%`],
                      ['Cintura', `${latest?.waist} cm`],
                      ['IMC', latest ? (latest.weight / Math.pow(latest.height / 100, 2)).toFixed(1) : '—'],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-xl border border-line bg-surface px-3 py-3">
                        <p className="text-[10.5px] text-muted">{l}</p>
                        <p className="text-[17px] font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>

                  {fullAnthro && <PortalAnthroGroups record={latest} />}

                  <Card className="mt-3 overflow-hidden">
                    <CardHeader title="Historial" subtitle="Solo lectura" />
                    <div className="divide-y divide-line border-t border-line">
                      {[...records].reverse().map((r) => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-[12px]">
                          <span className="inline-flex items-center gap-1.5 text-muted"><CalendarDays size={12} /> {fmtDate(r.date)}</span>
                          <span className="font-medium">{r.weight} kg · {r.bodyFat}%</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              )}

              {/* Perfil de pérdida: exclusivo del plan VIP (0.27.0 — gating).
                  0.27.2: fraccionamiento anatómico en 4 componentes (Kerr,
                  Rocha, Lee) con tabla Actual|Previo|Diferencia, 2 pasteles
                  y nota interpretativa. El somatotipo llega en 0.27.3. */}
              {vip && (
                <Card className="mt-4 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                        <Flame size={14} className="text-brand" /> Perfil de pérdida
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        Fraccionamiento corporal en 4 componentes
                      </p>
                    </div>
                    <Badge tone="brand">VIP</Badge>
                  </div>
                  {!fraction ? (
                    <p className="mt-3 rounded-xl bg-canvas px-3 py-3 text-center text-[11.5px] text-muted">
                      {records.length === 0
                        ? 'Cuando tu coach registre tu primera medición completa, aquí verás qué perdiste y qué ganaste.'
                        : 'Tu última medición no tiene pliegues ni diámetros completos. Pide a tu coach una medición completa para activar este análisis.'}
                    </p>
                  ) : (
                    <>
                      <table className="mt-3 w-full text-[11.5px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-muted">
                            <th className="pb-1 text-left font-medium">Componente</th>
                            <th className="pb-1 text-right font-medium">Actual</th>
                            {fractionPrev && <th className="pb-1 text-right font-medium">Previo</th>}
                            {fractionPrev && <th className="pb-1 text-right font-medium">Difer.</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {fractionTable.map((row) => (
                            <tr key={row.key} className="border-t border-line">
                              <td className="py-1.5">{row.label}</td>
                              <td className="py-1.5 text-right tabular-nums">
                                {row.actual.toFixed(1)}
                                <span className="text-[9.5px] text-muted"> kg · {shareOf[row.key].toFixed(0)}%</span>
                              </td>
                              {fractionPrev && (
                                <td className="py-1.5 text-right tabular-nums text-muted">
                                  {row.previous?.toFixed(1)}
                                </td>
                              )}
                              {fractionPrev && (
                                <td
                                  className={cx(
                                    'py-1.5 text-right font-medium tabular-nums',
                                    row.tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
                                    row.tone === 'bad' && 'text-danger',
                                    row.tone === 'warn' && 'text-warn',
                                    row.tone === 'neutral' && 'text-muted',
                                  )}
                                >
                                  {row.diff === null ? '' : `${row.diff > 0 ? '+' : ''}${row.diff.toFixed(1)}`}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-1.5 text-[10px] text-muted">
                        Σ8 = {fraction.sum8.toFixed(1)} mm · %grasa Kerr = {fraction.fatPercent.toFixed(1)}%
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {([
                          { title: 'Actual', date: latest?.date, comp: fraction },
                          fractionPrev && { title: 'Previa', date: prev?.date, comp: fractionPrev },
                        ].filter(Boolean) as Array<{ title: string; date?: string; comp: NonNullable<typeof fraction> }>).map((pie) => {
                          const slices = [
                            { name: 'Grasa', value: pie.comp.fat, fill: '#d53741' },
                            { name: 'Músculo', value: pie.comp.muscle, fill: '#10b981' },
                            { name: 'Hueso', value: pie.comp.bone, fill: '#756568' },
                            { name: 'Residual', value: pie.comp.residual, fill: '#1d4ed8' },
                          ]
                          return (
                            <div key={pie.title} className="rounded-xl bg-canvas p-3">
                              <p className="text-center text-[10.5px] uppercase tracking-wider text-muted">
                                {pie.title}{pie.date ? ` · ${fmtDateShort(pie.date)}` : ''}
                              </p>
                              <div className="relative mx-auto mt-1 h-[118px] w-[118px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={slices}
                                      dataKey="value"
                                      innerRadius={32}
                                      outerRadius={55}
                                      strokeWidth={0}
                                      startAngle={90}
                                      endAngle={-270}
                                    >
                                      {slices.map((s) => (
                                        <Cell key={s.name} fill={s.fill} />
                                      ))}
                                    </Pie>
                                  </PieChart>
                                </ResponsiveContainer>
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                  <p className="text-[13px] font-semibold tabular-nums">{pie.comp.fat.toFixed(1)}</p>
                                  <p className="text-[9px] text-muted">kg de grasa</p>
                                </div>
                              </div>
                              <div className="mt-1.5 space-y-0.5 text-[10px]">
                                {slices.map((s) => (
                                  <p key={s.name} className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5">
                                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fill }} />
                                      {s.name}
                                    </span>
                                    <span className="tabular-nums text-muted">{s.value.toFixed(1)} kg</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <p className="mt-3 rounded-xl bg-canvas px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                        {fractionNote(fraction, fractionPrev, prev?.date)}
                      </p>
                      {/* Somatotipo Heath-Carter (0.27.3): forma del cuerpo
                          en escala 1–7 con clasificación y somatocarta. */}
                      {somato && (
                        <div className="mt-3 border-t border-line pt-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[12px] font-semibold">Somatotipo</p>
                            <p className="text-[10.5px] text-muted">Heath-Carter · escala 1–7</p>
                          </div>
                          <table className="mt-2 w-full text-[11.5px]">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-wider text-muted">
                                <th className="pb-1 text-left font-medium">Componente</th>
                                <th className="pb-1 text-right font-medium">Actual</th>
                                {somatoPrev && <th className="pb-1 text-right font-medium">Previo</th>}
                                {somatoPrev && <th className="pb-1 text-right font-medium">Difer.</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {somatoTable.map((row) => (
                                <tr key={row.key} className="border-t border-line">
                                  <td className="py-1.5">{row.label}</td>
                                  <td className="py-1.5 text-right tabular-nums">{row.actual.toFixed(1)}</td>
                                  {somatoPrev && (
                                    <td className="py-1.5 text-right tabular-nums text-muted">
                                      {row.previous?.toFixed(1)}
                                    </td>
                                  )}
                                  {somatoPrev && (
                                    <td
                                      className={cx(
                                        'py-1.5 text-right font-medium tabular-nums',
                                        row.tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
                                        row.tone === 'bad' && 'text-danger',
                                        row.tone === 'neutral' && 'text-muted',
                                      )}
                                    >
                                      {row.diff === null ? '' : `${row.diff > 0 ? '+' : ''}${row.diff.toFixed(1)}`}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-1 text-[11.5px]">
                            <span className="text-muted">Clasificación:</span>{' '}
                            <span className="font-medium">{somato.category}</span>
                            {somatoPrev && (
                              <span className="text-muted"> · previo: {somatoPrev.category}</span>
                            )}
                          </p>
                          <Somatocarta
                            current={somato}
                            currentDate={latest?.date}
                            previous={somatoPrev}
                            prevDate={prev?.date}
                          />
                          <p className="mt-2 rounded-xl bg-canvas px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                            {somatoNote(somato, somatoPrev)}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </Card>
              )}
              </div>
            </>
          )}
        </main>

        {/* Navegación inferior */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg border-t border-line bg-surface/95 backdrop-blur lg:hidden">
          <div className="flex items-stretch justify-around px-2 pt-1">
            {visibleTabs.map((t) => {
              const active = location.pathname === t.path
              return (
                <button
                  key={t.path}
                  onClick={() => navigate(t.path)}
                  className={cx('flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10.5px] font-medium', active ? 'text-brand' : 'text-muted')}
                >
                  <t.icon size={20} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Cómo pagar"
        subtitle="Transferencia SPEI · sin comisiones"
        footer={<Button className="w-full" onClick={() => setPayOpen(false)}>Entendido</Button>}
      >
        {payPanel}
      </Modal>

      {viewer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
          <button
            onClick={() => setViewer(null)}
            className="fixed right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-ink shadow-lg transition hover:bg-canvas"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X size={20} />
          </button>
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-start gap-3 px-4 pb-8 pt-14">
            <img
              src={exerciseImageUrl(viewer.key)}
              alt={`Foto de ${viewer.name}`}
              className="max-h-[58vh] w-full rounded-2xl border border-line bg-surface object-contain"
            />
            {/* Prescripción del coach: lo que puso en la rutina, junto a la foto. */}
            {viewer.cardio ? (
              <div className="rounded-2xl border border-warn/30 bg-warn-soft px-3 py-2.5 text-center">
                <p className="text-[17px] font-semibold text-ink">{viewer.minutes ?? 20} min</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-warn">Cardio</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Series', value: viewer.sets ?? '—' },
                  { label: 'Reps', value: viewer.reps || '—' },
                  { label: 'Descanso', value: viewer.restSeconds ? `${viewer.restSeconds} s` : viewer.rest || '—' },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-line bg-surface px-3 py-2.5 text-center">
                    <p className="text-[17px] font-semibold text-ink">{card.value}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted">{card.label}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-[11px] font-medium text-muted">Cómo se realiza</p>
              {(() => {
                // Respaldo doble: por enlace con la biblioteca y por nombre, así
                // la descripción aparece aunque la rutina no traiga catalogId.
                const instructions = guideFor(viewer.name, viewer.catalogId)?.instructions || ''
                const notes = (viewer.notes ?? '').trim()
                if (!instructions && !notes) {
                  return (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                      Tu coach aún no agrega la descripción de este ejercicio.
                    </p>
                  )
                }
                return (
                  <>
                    {instructions && (
                      <p className="mt-1 text-[13px] leading-relaxed">{instructions}</p>
                    )}
                    {notes && (
                      <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted">
                        <span className="font-medium">Nota de tu coach:</span> {notes}
                      </p>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      <SelfWeightModal
        open={weightOpen}
        onClose={() => setWeightOpen(false)}
        clientId={client.id}
        defaultHeight={latest?.height ?? 168}
        onSave={async (data) => {
          const res = await addAnthro(data)
          if (!res.ok) { notify(res.error ?? 'No se pudo guardar', 'warn'); return }
          setWeightOpen(false)
          notify('Peso registrado · tu coach ya lo puede ver')
        }}
      />

      {logging && routine && (
        <ExerciseLogModal
          key={logging.exercise.id}
          routineId={routine.id}
          exercise={logging.exercise}
          lastLog={lastLogFor(logging.exercise.name)}
          onClose={() => setLogging(null)}
          onSaved={(log) => {
            setLogs((items) => [log, ...items.filter((item) => item.id !== log.id)])
            setLogging(null)
            notify(`Carga de ${log.exerciseName} registrada`)
          }}
        />
      )}

      {intensityOpen && routine && (
        <IntensityModal
          routineId={routine.id}
          routineName={routine.name}
          onClose={() => setIntensityOpen(false)}
          onSaved={(checkin) => {
            setCheckins((items) => [checkin, ...items.filter((item) => item.id !== checkin.id)])
            setIntensityOpen(false)
            notify(`Intensidad ${checkin.intensity}/10 registrada`)
          }}
        />
      )}

      {accountOpen && currentUser && (
        <AccountModal
          name={currentUser.name}
          password={accountPassword}
          onClose={() => setAccountOpen(false)}
          onSave={async (data) => {
            const res = await updateOwnAccount({ ...data, currentPassword: accountPassword })
            if (!res.ok) return res.error ?? 'No se pudo guardar'
            setAccountOpen(false)
            if (data.password) void loadMyPassword().then((value) => setAccountPassword(value ?? ''))
            notify('Tu cuenta se actualizó')
            return null
          }}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div
            className={cx(
              'pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium shadow-lg',
              toast.tone === 'ok' ? 'bg-ink text-canvas' : 'bg-warn text-canvas',
            )}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}

function AccountModal({
  name, password, onClose, onSave,
}: {
  name: string
  password: string
  onClose: () => void
  onSave: (data: { name?: string; password?: string }) => Promise<string | null>
}) {
  const [fullName, setFullName] = useState(name)
  const [showCurrent, setShowCurrent] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    if (!fullName.trim()) {
      setError('Tu nombre no puede quedar vacío.')
      return
    }
    if (newPassword || confirm) {
      const problem = passwordProblem(newPassword)
      if (problem) {
        setError(problem)
        return
      }
      if (newPassword !== confirm) {
        setError('Las contraseñas no coinciden.')
        return
      }
    }
    setBusy(true)
    const res = await onSave({
      name: fullName.trim(),
      ...(newPassword ? { password: newPassword } : {}),
    })
    setBusy(false)
    if (res) setError(res)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Mi cuenta"
      subtitle="Tu coach no puede ver ni cambiar estos datos"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={submit} disabled={busy}>Guardar cambios</Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Nombre con el que entras" hint="También es tu usuario para iniciar sesión.">
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Tu contraseña actual" hint="Puedes verla si la olvidaste.">
          <div className="flex items-center gap-2">
            <input className={cx(inputClass, 'font-mono tracking-wide')} value={showCurrent ? password : '••••••••'} readOnly />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted hover:text-ink"
              aria-label={showCurrent ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nueva contraseña" hint={`${PASSWORD_HINT} Déjala vacía para conservarla.`}>
            <input className={inputClass} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirmar contraseña">
            <input className={inputClass} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
      </div>
      {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
    </Modal>
  )
}

/**
 * Somatocarta (0.27.3): triángulo de Heath-Carter con las escalas 1–7 y
 * los puntos de la medición actual y previa. Coordenadas oficiales:
 * X = ecto − endo, Y = 2·meso − (endo + ecto).
 */
function Somatocarta({
  current,
  currentDate,
  previous,
  prevDate,
}: {
  current: SomatoType
  currentDate?: string
  previous?: SomatoType | null
  prevDate?: string
}) {
  // Unidad = 10 px. Origen al centro; el eje de mesomorfia (Y = 14 en la
  // escala 7) sube hasta casi el borde superior.
  const ox = 75
  const oy = 145
  const px = (x: number) => ox + 10 * x
  const py = (y: number) => oy - 10 * y
  const axisTicks = [1, 2, 3, 4, 5, 6, 7]
  return (
    <div className="mt-2 rounded-xl bg-canvas p-2">
      <svg viewBox="0 0 150 215" className="mx-auto block h-auto w-full max-w-[220px]" role="img" aria-label="Somatocarta">
        {/* Triángulo exterior y guías de rating (líneas que unen escalas iguales). */}
        {axisTicks.map((r) => (
          <polygon
            key={r}
            points={`${px(-r)},${py(-r)} ${px(0)},${py(2 * r)} ${px(r)},${py(-r)}`}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={r === 7 ? 1.2 : 0.6}
          />
        ))}
        {/* Ticks de las escalas 1–7 sobre los tres ejes. */}
        {axisTicks.map((r) => (
          <g key={`t${r}`}>
            <circle cx={px(-r)} cy={py(-r)} r={1.1} fill="var(--color-muted)" />
            <circle cx={px(0)} cy={py(2 * r)} r={1.1} fill="var(--color-muted)" />
            <circle cx={px(r)} cy={py(-r)} r={1.1} fill="var(--color-muted)" />
            <text x={px(-r) - 3} y={py(-r) + 2.5} fontSize="4.5" textAnchor="end" fill="var(--color-muted)">{r}</text>
            <text x={px(r) + 3} y={py(-r) + 2.5} fontSize="4.5" textAnchor="start" fill="var(--color-muted)">{r}</text>
          </g>
        ))}
        {/* Etiquetas de los vértices. */}
        <text x={px(0)} y={py(14) - 4} fontSize="5.5" fontWeight="600" textAnchor="middle" fill="var(--color-muted)">Mesomorfia</text>
        <text x={px(-7)} y={py(-7) + 6} fontSize="5.5" fontWeight="600" textAnchor="middle" fill="var(--color-muted)">Endomorfia</text>
        <text x={px(7)} y={py(-7) + 6} fontSize="5.5" fontWeight="600" textAnchor="middle" fill="var(--color-muted)">Ectomorfia</text>
        {/* Punto previo (gris) y actual (marca, con su fecha). */}
        {previous && (
          <g>
            <circle cx={px(previous.x)} cy={py(previous.y)} r={2.6} fill="var(--color-muted)" />
            <text x={px(previous.x) - 4} y={py(previous.y) + 2} fontSize="4.5" textAnchor="end" fill="var(--color-muted)">
              {prevDate ? fmtDateShort(prevDate) : 'Previa'}
            </text>
          </g>
        )}
        <g>
          <circle cx={px(current.x)} cy={py(current.y)} r={3.4} fill="var(--color-brand)" stroke="var(--color-surface)" strokeWidth={1.2} />
          <text x={px(current.x) + 5} y={py(current.y) + 2} fontSize="4.8" fontWeight="600" fill="var(--color-ink)">
            Actual{currentDate ? ` · ${fmtDateShort(currentDate)}` : ''}
          </text>
        </g>
      </svg>
    </div>
  )
}

function PortalAnthroGroups({ record }: { record?: AnthroRecord }) {
  if (!record) return null
  const allGroups: Array<{ title: string; rows: Array<[string, number, string]> }> = [
    {
      title: 'Circunferencias',
      rows: [
        ['Brazo relajado', record.arm, 'cm'], ['Brazo flexionado', record.armFlexed, 'cm'],
        ['Cintura', record.waist, 'cm'], ['Cadera', record.hip, 'cm'],
        ['Muslo', record.thigh, 'cm'], ['Pantorrilla', record.calf, 'cm'],
      ],
    },
    {
      title: 'Pliegues cutáneos',
      rows: [
        ['Tríceps', record.skinfoldTriceps, 'mm'], ['Bíceps', record.skinfoldBiceps, 'mm'],
        ['Espalda', record.skinfoldSubscapular, 'mm'], ['Cresta iliaca', record.skinfoldIliac, 'mm'],
        ['Supraespinal', record.skinfoldSupraspinal, 'mm'], ['Abdominal', record.skinfoldAbdominal, 'mm'],
        ['Muslo medial', record.skinfoldThigh, 'mm'], ['Pantorrilla', record.skinfoldCalf, 'mm'],
      ],
    },
    {
      title: 'Diámetros óseos',
      rows: [
        ['Muñeca', record.diameterWrist, 'cm'], ['Codo', record.diameterElbow, 'cm'],
        ['Rodilla', record.diameterKnee, 'cm'],
      ],
    },
  ]
  const groups = allGroups
    .map((group) => ({ ...group, rows: group.rows.filter(([, value]) => Number(value) > 0) }))
    .filter((group) => group.rows.length > 0)

  if (groups.length === 0) return null

  return (
    <Card className="mt-3 p-4">
      <p className="text-[13px] font-semibold">Medidas registradas por tu coach</p>
      <div className="mt-3 space-y-3">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{group.title}</p>
            <div className="grid grid-cols-2 gap-2">
              {group.rows.map(([label, value, unit]) => (
                <div key={label} className="rounded-xl border border-line bg-surface px-3 py-2">
                  <p className="text-[10.5px] text-muted">{label}</p>
                  <p className="text-[13.5px] font-medium">{value} {unit}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function SelfWeightModal({
  open, onClose, clientId, defaultHeight, onSave,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  defaultHeight: number
  onSave: (data: {
    clientId: string; date: string; weight: number; height: number; bodyFat: number
    waist: number; hip: number; arm: number; armFlexed: number; thigh: number; calf: number
    skinfoldTriceps: number; skinfoldBiceps: number; skinfoldSubscapular: number; skinfoldIliac: number
    skinfoldSupraspinal: number; skinfoldAbdominal: number; skinfoldThigh: number; skinfoldCalf: number
    diameterWrist: number; diameterElbow: number; diameterKnee: number; notes?: string
  }) => void
}) {
  const [form, setForm] = useState({ date: todayISO(), weight: '', bodyFat: '', waist: '', notes: '' })
  const [error, setError] = useState('')

  const submit = () => {
    if (!form.weight) {
      setError('Escribe tu peso para guardar.')
      return
    }
    onSave({
      clientId,
      date: form.date,
      weight: Number(form.weight),
      height: defaultHeight,
      bodyFat: Number(form.bodyFat || 0),
      waist: Number(form.waist || 0),
      hip: 0,
      arm: 0,
      armFlexed: 0,
      thigh: 0,
      calf: 0,
      skinfoldTriceps: 0,
      skinfoldBiceps: 0,
      skinfoldSubscapular: 0,
      skinfoldIliac: 0,
      skinfoldSupraspinal: 0,
      skinfoldAbdominal: 0,
      skinfoldThigh: 0,
      skinfoldCalf: 0,
      diameterWrist: 0,
      diameterElbow: 0,
      diameterKnee: 0,
      notes: form.notes || undefined,
    })
    setForm({ date: todayISO(), weight: '', bodyFat: '', waist: '', notes: '' })
    setError('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar mi peso"
      subtitle="Tu coach verá este registro marcado como capturado por ti"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={submit}>Guardar</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha">
          <input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Peso (kg)">
          <input className={inputClass} inputMode="decimal" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="Ej. 72.4" autoFocus />
        </Field>
        <Field label="% grasa (opcional)">
          <input className={inputClass} inputMode="decimal" value={form.bodyFat} onChange={(e) => setForm({ ...form, bodyFat: e.target.value })} placeholder="Ej. 24" />
        </Field>
        <Field label="Cintura (opcional)">
          <input className={inputClass} inputMode="decimal" value={form.waist} onChange={(e) => setForm({ ...form, waist: e.target.value })} placeholder="cm" />
        </Field>
        <Field label="Notas (opcional)" className="sm:col-span-2">
          <textarea className={cx(inputClass, 'min-h-20 resize-y')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Cómo te sentiste, si te mediste en ayunas…" />
        </Field>
      </div>
      {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Pésate siempre en la misma báscula y a la misma hora para que la gráfica sea comparable.
      </p>
    </Modal>
  )
}

/* ------------------------- Registro de cargas por serie ------------------------- */

type SetDraft = { weight: string; reps: string }

function ExerciseLogModal({
  routineId, exercise, lastLog, onClose, onSaved,
}: {
  routineId: string
  exercise: Exercise
  lastLog?: ExerciseLog
  onClose: () => void
  onSaved: (log: ExerciseLog) => void
}) {
  const defaultReps = exercise.reps.match(/\d+/)?.[0] ?? '10'
  const rest = exercise.restSeconds ?? (Number.parseInt(exercise.rest, 10) || 60)
  const initialCount = Math.max(1, exercise.sets || 3, lastLog?.sets.length ?? 0)

  const [sets, setSets] = useState<SetDraft[]>(() =>
    Array.from({ length: initialCount }, (_, index) => {
      const previous = lastLog?.sets[index]
      return {
        weight: previous?.weight !== null && previous?.weight !== undefined ? String(previous.weight) : '',
        reps: previous ? String(previous.reps) : defaultReps,
      }
    }),
  )
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (remaining === null || remaining <= 0) return
    const timer = window.setTimeout(
      () => setRemaining((value) => (value === null ? null : value - 1)),
      1000,
    )
    return () => window.clearTimeout(timer)
  }, [remaining])

  const patchSet = (index: number, patch: Partial<SetDraft>) =>
    setSets((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const submit = async () => {
    setError('')
    if (sets.length === 0) {
      setError('Registra al menos una serie.')
      return
    }

    const parsed: Array<{ weight: number | null; reps: number }> = []
    for (const item of sets) {
      const reps = Number(item.reps)
      if (!Number.isInteger(reps) || reps < 0 || reps > 1000) {
        setError('Las repeticiones deben ser un entero entre 0 y 1000.')
        return
      }
      const weight = item.weight.trim() === '' ? null : Number(item.weight)
      if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) {
        setError('El peso debe estar entre 0 y 1000 kg.')
        return
      }
      parsed.push({ weight, reps })
    }

    setBusy(true)
    try {
      const data = await apiCreateExerciseLog({
        routineId,
        exerciseName: exercise.name,
        catalogId: exercise.catalogId ?? null,
        date,
        notes: notes.trim() || undefined,
        sets: parsed.map((item) => ({ ...item, restSeconds: rest })),
      })
      if (data.log) onSaved(data.log)
      else setError('No se pudo confirmar el registro.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la carga.')
    } finally {
      setBusy(false)
    }
  }

  const timerLabel = remaining === null
    ? `${rest} s`
    : remaining > 0
      ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
      : '¡Descanso terminado!'

  return (
    <Modal
      open
      onClose={onClose}
      title={`Carga · ${exercise.name}`}
      subtitle={`${exercise.sets} series objetivo de ${exercise.reps} · descanso ${rest} s`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar carga'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha">
          <input
            type="date"
            className={inputClass}
            max={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Descanso del coach">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-[13px]">
              <Timer size={14} className="text-brand" /> {timerLabel}
            </span>
            <Button
              size="sm"
              variant={remaining && remaining > 0 ? 'secondary' : 'soft'}
              onClick={() => setRemaining(remaining && remaining > 0 ? null : rest)}
            >
              {remaining && remaining > 0 ? 'Detener' : 'Iniciar'}
            </Button>
          </div>
        </Field>
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-[24px_1fr_1fr_28px] items-center gap-2 px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          <span>#</span>
          <span>Peso (kg)</span>
          <span>Reps</span>
          <span />
        </div>
        <div className="space-y-1.5">
          {sets.map((item, index) => (
            <div key={index} className="grid grid-cols-[24px_1fr_1fr_28px] items-center gap-2">
              <span className="text-center text-[11px] font-semibold text-muted">{index + 1}</span>
              <input
                className={cx(inputClass, 'h-9 px-2 py-1 text-[12.5px]')}
                inputMode="decimal"
                placeholder="kg"
                value={item.weight}
                onChange={(e) => patchSet(index, { weight: e.target.value })}
              />
              <input
                className={cx(inputClass, 'h-9 px-2 py-1 text-[12.5px]')}
                inputMode="numeric"
                placeholder="reps"
                value={item.reps}
                onChange={(e) => patchSet(index, { reps: e.target.value })}
              />
              <button
                onClick={() => setSets((current) => current.filter((_, i) => i !== index))}
                className="rounded-md p-1 text-muted hover:text-danger"
                aria-label={`Quitar serie ${index + 1}`}
                disabled={sets.length <= 1}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setSets((current) => [
            ...current,
            {
              weight: current[current.length - 1]?.weight ?? '',
              reps: current[current.length - 1]?.reps ?? defaultReps,
            },
          ])}
          className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-brand"
        >
          <Plus size={12} /> Agregar serie
        </button>
      </div>

      <Field label="Notas (opcional)" className="mt-3">
        <textarea
          className={cx(inputClass, 'min-h-16 resize-y')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Cómo se sintió la serie, ajustes de técnica…"
        />
      </Field>

      {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
    </Modal>
  )
}

/* --------------------------- Intensidad de la sesión --------------------------- */

function IntensityModal({
  routineId, routineName, onClose, onSaved,
}: {
  routineId: string
  routineName: string
  onClose: () => void
  onSaved: (checkin: RoutineCheckin) => void
}) {
  const [intensity, setIntensity] = useState(7)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await apiCreateCheckin({
        routineId,
        intensity,
        notes: notes.trim() || undefined,
      })
      if (data.checkin) onSaved(data.checkin)
      else setError('No se pudo confirmar el registro.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la intensidad.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Intensidad de hoy"
      subtitle={routineName}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar intensidad'}
          </Button>
        </div>
      }
    >
      <p className="text-[12px] leading-relaxed text-muted">
        ¿Qué tan exigente sentiste la sesión? 1 es muy ligera y 10 es al límite.
      </p>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            onClick={() => setIntensity(value)}
            className={cx(
              'rounded-xl border py-2.5 text-[14px] font-semibold transition-colors',
              intensity === value
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-ink hover:border-brand/40',
            )}
            aria-pressed={intensity === value}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] text-muted">
        <span>1 · Ligera</span>
        <span>10 · Al límite</span>
      </div>

      <Field label="Notas (opcional)" className="mt-4">
        <textarea
          className={cx(inputClass, 'min-h-16 resize-y')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Qué te costó más, cómo dormiste, molestias…"
        />
      </Field>

      {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
    </Modal>
  )
}
