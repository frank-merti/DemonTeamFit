import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight, CalendarClock, CheckCircle2, Dumbbell,
  Plus, ShieldCheck, TrendingUp, UserPlus, Users, Wallet,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { useScopedClients } from '../lib/hooks'
import { mxn, fmtDateShort, daysLeft, clientStatus, STATUS_META, avatarColor, relative, todayISO } from '../lib/format'
import type { Client } from '../types'
import { ROLE_LABEL } from '../types'
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Progress, Stat } from '../components/ui'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function SuperAdminHome() {
  const { users, payments, audit, settings, activeClients } = useApp()
  const pending = payments.filter((p) => p.status === 'pendiente')
  const modulesActive = Object.values(settings.roleModules).flat().length

  return (
    <>
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Panel de plataforma</p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight sm:text-[27px]">Resumen del sistema</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          {ROLE_LABEL.super_admin} · {settings.gymName}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cuentas activas" value={String(users.filter((u) => u.active).length)} hint={`${users.length} registradas`} icon={<Users size={16} />} tone="brand" />
        <Stat label="Clientes con membresía" value={`${activeClients.length}`} hint="Membresías al día" icon={<UserPlus size={16} />} />
        <Stat label="Pagos por conciliar" value={String(pending.length)} hint="Requieren revisión" icon={<Wallet size={16} />} tone={pending.length ? 'warn' : 'neutral'} />
        <Stat label="Módulos activos" value={String(modulesActive)} hint="4 roles configurados" icon={<ShieldCheck size={16} />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn">
              <ShieldCheck size={17} />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold">Acceso clínico restringido</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                Tu rol no ve antropometría, rutinas ni planes. Si necesitas entrar, solicita acceso
                de excepción por 24 h y quedará en auditoría.
              </p>
              <Link to="/sistema" className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-brand">
                Ir a Sistema <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Últimos movimientos" action={<Link to="/auditoria" className="text-[12px] font-medium text-brand">Ver todo</Link>} />
          <div className="divide-y divide-line border-t border-line">
            {audit.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-muted">
                Sin movimientos todavía. Las acciones del equipo aparecerán aquí.
              </p>
            )}
            {audit.slice(0, 3).map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-[12.5px] font-medium">{a.actor} <span className="font-normal text-muted">· {a.action}</span></p>
                <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted">{a.detail}</p>
                <p className="mt-0.5 text-[10.5px] text-muted/80">{relative(a.at)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

function ClientAttentionRow({ client }: { client: Client }) {
  const status = clientStatus(client)
  const left = daysLeft(client.endDate)
  return (
    <Link
      to={`/clientes/${client.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas/70"
    >
      <Avatar name={client.name} color={avatarColor(client.id)} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{client.name}</p>
        <p className="text-[11.5px] text-muted">{client.goal}</p>
      </div>
      <div className="text-right">
        <Badge tone={status === 'vencido' ? 'danger' : status === 'por_vencer' ? 'warn' : 'brand'} dot={STATUS_META[status].dot}>
          {status === 'vencido' ? `${Math.abs(left)} d vencido` : `${left} d`}
        </Badge>
        <p className="mt-1 text-[10.5px] text-muted">{fmtDateShort(client.endDate)}</p>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { viewRole, currentUser, payments } = useApp()
  const scoped = useScopedClients()

  if (viewRole === 'super_admin') return <SuperAdminHome />

  const active = scoped.filter((c) => !c.archived)
  const expiring = active
    .filter((c) => ['por_vencer', 'vencido'].includes(clientStatus(c)))
    .sort((a, b) => daysLeft(a.endDate) - daysLeft(b.endDate))
  const scopedIds = new Set(active.map((c) => c.id))
  const pending = payments.filter((p) => p.status === 'pendiente' && (viewRole !== 'coach' || scopedIds.has(p.clientId)))
  const month = todayISO().slice(0, 7)
  const income = payments
    .filter((p) => p.status === 'aprobado' && p.date.startsWith(month) && (viewRole !== 'coach' || scopedIds.has(p.clientId)))
    .reduce((sum, p) => sum + p.amount, 0)

  const newClients = active.filter((c) => daysLeft(c.startDate) > -31).length
  const avgAdherence = active.length ? Math.round(active.reduce((s, c) => s + c.adherence, 0) / active.length) : 0
  const coachName = currentUser?.name.split(' ')[0] ?? ''

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight sm:text-[27px]">
            {greeting()}, {coachName}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {expiring.length > 0
              ? `${expiring.length} ${expiring.length === 1 ? 'cliente requiere' : 'clientes requieren'} tu atención hoy.`
              : 'Todo al día. Buen trabajo.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/pagos?nuevo=1')}>
            <Wallet size={16} /> Registrar pago
          </Button>
          <Button onClick={() => navigate('/clientes?nuevo=1')}>
            <Plus size={16} /> Nuevo cliente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Clientes activos"
          value={String(active.length)}
          hint="En tu padrón"
          icon={<Users size={16} />}
          tone="brand"
        />
        <Stat
          label="Cobrado este mes"
          value={mxn(income)}
          hint={`${active.filter((c) => daysLeft(c.endDate) > 0).length} membresías vigentes`}
          icon={<TrendingUp size={16} />}
        />
        <Stat
          label="Por vencer / vencidos"
          value={String(expiring.length)}
          hint="Próximos 7 días o ya vencidos"
          icon={<CalendarClock size={16} />}
          tone={expiring.length ? 'warn' : 'neutral'}
        />
        <Stat
          label="Pagos por aprobar"
          value={String(pending.length)}
          hint={pending.length ? 'Transferencias recibidas' : 'Sin pendientes'}
          icon={<Wallet size={16} />}
          tone={pending.length ? 'warn' : 'neutral'}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader
            title="Requieren tu atención"
            subtitle="Ordenados por fecha de vencimiento"
            action={
              <Link to="/clientes" className="text-[12px] font-medium text-brand">
                Ver clientes
              </Link>
            }
          />
          {expiring.length === 0 ? (
            <EmptyState title="Nada pendiente" description="Ningún cliente vence en los próximos 7 días." />
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {expiring.slice(0, 5).map((c) => (
                <ClientAttentionRow key={c.id} client={c} />
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Cobranza del mes" subtitle={`${active.length} clientes con membresía`} />
            <div className="px-5 pb-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[26px] font-semibold leading-none">{mxn(income)}</p>
                  <p className="mt-1 text-[11.5px] text-muted">de {mxn(active.reduce((s, c) => s + c.price, 0))} esperados</p>
                </div>
                <Badge tone="brand">{Math.round((income / Math.max(1, active.reduce((s, c) => s + c.price, 0))) * 100)}%</Badge>
              </div>
              <Progress className="mt-3" value={(income / Math.max(1, active.reduce((s, c) => s + c.price, 0))) * 100} />
              <div className="mt-4 space-y-2 border-t border-line pt-3">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-muted">Pagos aprobados</span>
                  <span className="font-medium">{payments.filter((p) => p.status === 'aprobado' && (viewRole !== 'coach' || scopedIds.has(p.clientId))).length}</span>
                </div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-muted">Pendientes de revisión</span>
                  <span className={pending.length ? 'font-medium text-warn' : 'font-medium'}>{pending.length}</span>
                </div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-muted">Adherencia promedio</span>
                  <span className="font-medium">{avgAdherence}%</span>
                </div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-muted">Altas del mes</span>
                  <span className="font-medium">{newClients}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Acciones rápidas" />
            <div className="grid grid-cols-2 gap-2 px-4 pb-4">
              {[
                { label: 'Nuevo cliente', icon: UserPlus, to: '/clientes?nuevo=1' },
                { label: 'Rutinas', icon: Dumbbell, to: '/rutinas' },
                { label: 'Aprobar pagos', icon: CheckCircle2, to: '/pagos' },
                { label: 'Antropometría', icon: TrendingUp, to: active[0] ? `/clientes/${active[0].id}/antropometria` : '/clientes' },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.to)}
                  className="flex flex-col items-start gap-2 rounded-xl border border-line px-3 py-3 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/30"
                >
                  <a.icon size={17} className="text-brand" />
                  <span className="text-[12.5px] font-medium leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Clientes recientes"
          subtitle={`${active.length} clientes en tu padrón`}
          action={
            <Link to="/clientes" className="text-[12px] font-medium text-brand">
              Ver padrón
            </Link>
          }
        />
        {active.length === 0 ? (
          <EmptyState
            title="Tu padrón está vacío"
            description="Da de alta a tu primer cliente para empezar a registrar membresías y rutinas."
            action={<Button size="sm" onClick={() => navigate('/clientes?nuevo=1')}><Plus size={15} /> Nuevo cliente</Button>}
          />
        ) : (
          <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.slice(0, 6).map((c) => (
            <Link
              key={c.id}
              to={`/clientes/${c.id}`}
              className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition-colors hover:bg-canvas/70"
            >
              <Avatar name={c.name} color={avatarColor(c.id)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium">{c.name}</p>
                <p className="text-[11px] text-muted">{c.goal}</p>
              </div>
              <Badge tone={clientStatus(c) === 'activo' ? 'brand' : clientStatus(c) === 'por_vencer' ? 'warn' : clientStatus(c) === 'pausado' ? 'neutral' : 'danger'}>
                {STATUS_META[clientStatus(c)].label}
              </Badge>
            </Link>
          ))}
          </div>
        )}
      </Card>
    </>
  )
}
