import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Copy, Filter, Plus, RefreshCw, RotateCcw, Search, Users } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { useScopedClients } from '../lib/hooks'
import { clientStatus, daysLeft, fmtDateShort, mxn, avatarColor, todayISO, STATUS_META } from '../lib/format'
import { PASSWORD_HINT, generateTemporaryPassword, passwordProblem } from '../lib/password'
import type { ClientStatus } from '../types'
import { Avatar, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Progress, SearchInput, Stat, Tabs, inputClass, cx } from '../components/ui'

type FilterKey = 'todos' | ClientStatus | 'archivados'

const freshPassword = () => {
  try {
    return generateTemporaryPassword(10)
  } catch {
    return ''
  }
}

export default function Clients() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { addClient, viewRole, users, notify, restoreClient, currentUser } = useApp()
  const scoped = useScopedClients()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('todos')
  const [openNew, setOpenNew] = useState(params.get('nuevo') === '1')
  const [form, setForm] = useState({
    name: '', phone: '', email: '', goal: 'Pérdida de grasa', sexo: 'masculino',
    username: '', password: freshPassword(),
    startDate: todayISO(), price: '2000', coachId: 'u-coach-1',
  })
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ name: string; username: string; password: string; clientId?: string } | null>(null)

  const active = scoped.filter((c) => !c.archived)
  const coaches = users.filter((u) => u.role === 'coach')

  const filtered = useMemo(() => {
    let list = scoped
    if (filter === 'archivados') list = list.filter((c) => c.archived)
    else {
      list = list.filter((c) => !c.archived)
      if (filter !== 'todos') list = list.filter((c) => clientStatus(c) === filter)
    }
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((c) => `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q))
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [scoped, filter, query])

  const counts = {
    todos: active.length,
    activo: active.filter((c) => clientStatus(c) === 'activo').length,
    por_vencer: active.filter((c) => clientStatus(c) === 'por_vencer').length,
    vencido: active.filter((c) => clientStatus(c) === 'vencido').length,
    pausado: active.filter((c) => clientStatus(c) === 'pausado').length,
    archivados: scoped.filter((c) => c.archived).length,
  }

  const closeNew = () => {
    setOpenNew(false)
    setError('')
    if (params.get('nuevo')) {
      params.delete('nuevo')
      setParams(params, { replace: true })
    }
  }

  const openNewClient = () => {
    setError('')
    setForm((prev) => ({ ...prev, username: '', password: freshPassword() }))
    setOpenNew(true)
  }

  const closeCreated = () => {
    const clientId = created?.clientId
    setCreated(null)
    if (viewRole === 'coach' && clientId) navigate(`/clientes/${clientId}`)
  }

  const submit = async () => {
    const username = form.username.trim()
    if (username && username.length < 3) {
      setError('El usuario debe tener al menos 3 caracteres.')
      return
    }
    if (form.password) {
      const problem = passwordProblem(form.password)
      if (problem) {
        setError(problem)
        return
      }
    }
    const res = await addClient({
      ...form,
      sexo: form.sexo as 'masculino' | 'femenino',
      username: username || undefined,
      password: form.password || undefined,
      price: Number(form.price),
      coachId: viewRole === 'coach' ? (currentUser?.id ?? 'u-coach-1') : form.coachId,
    })
    if (!res.ok) {
      setError(res.error ?? 'No se pudo guardar')
      return
    }
    closeNew()
    if (viewRole === 'coach') notify('Cliente dado de alta · comparte su acceso')
    setCreated({
      name: form.name,
      username: res.username ?? username ?? form.name,
      password: res.password ?? form.password,
      clientId: res.id,
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="Padrón"
        title="Clientes"
        subtitle={`${active.length} ${active.length === 1 ? 'cliente' : 'clientes'} en cartera · ${counts.por_vencer + counts.vencido} requieren renovación`}
        actions={
          <Button onClick={openNewClient}>
            <Plus size={16} /> Nuevo cliente
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vigentes" value={String(counts.activo)} hint="Membresía al día" icon={<Users size={16} />} tone="brand" />
        <Stat label="Por vencer" value={String(counts.por_vencer)} hint="Próximos 7 días" tone={counts.por_vencer ? 'warn' : 'neutral'} />
        <Stat label="Vencidos" value={String(counts.vencido)} hint="Requieren seguimiento" tone={counts.vencido ? 'danger' : 'neutral'} />
        <Stat label="Pausados" value={String(counts.pausado)} hint="Sin cobro activo" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, teléfono o correo" />
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <Filter size={14} /> {filtered.length} resultados
          </div>
        </div>

        <div className="border-b border-line px-2 py-1.5">
          <Tabs
            value={filter}
            onChange={(v) => setFilter(v as FilterKey)}
            items={[
              { value: 'todos', label: 'Todos', count: counts.todos },
              { value: 'activo', label: 'Vigentes', count: counts.activo },
              { value: 'por_vencer', label: 'Por vencer', count: counts.por_vencer },
              { value: 'vencido', label: 'Vencidos', count: counts.vencido },
              { value: 'pausado', label: 'Pausados', count: counts.pausado },
              { value: 'archivados', label: 'Archivados', count: counts.archivados },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            description={query ? 'Prueba con otro nombre o limpia la búsqueda.' : 'Todavía no hay clientes en este filtro.'}
            action={filter !== 'archivados' ? <Button size="sm" onClick={() => setOpenNew(true)}><Plus size={15} /> Dar de alta</Button> : undefined}
          />
        ) : (
          <>
            {/* Escritorio */}
            <div className="hidden lg:block">
              <div className="grid grid-cols-[2.2fr_1.1fr_1fr_0.9fr_0.8fr] gap-3 border-b border-line bg-canvas/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <span>Cliente</span>
                <span>Membresía</span>
                <span>Adherencia</span>
                <span>Estatus</span>
                <span className="text-right">Mensualidad</span>
              </div>
              {filtered.map((c) => {
                const st = clientStatus(c)
                return (
                  <button
                    key={c.id}
                    onClick={() => (c.archived ? undefined : navigate(`/clientes/${c.id}`))}
                    className={cx(
                      'grid w-full grid-cols-[2.2fr_1.1fr_1fr_0.9fr_0.8fr] items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0',
                      !c.archived && 'hover:bg-canvas/70',
                      c.archived && 'opacity-60',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={c.name} color={avatarColor(c.id)} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{c.name}</p>
                        <p className="truncate text-[11.5px] text-muted">{c.goal}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[12.5px]">{fmtDateShort(c.startDate)} → {fmtDateShort(c.endDate)}</p>
                      <p className={cx('text-[11px]', daysLeft(c.endDate) < 0 ? 'text-danger' : 'text-muted')}>
                        {daysLeft(c.endDate) < 0 ? `${Math.abs(daysLeft(c.endDate))} días vencido` : `${daysLeft(c.endDate)} días restantes`}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Progress value={c.adherence} tone={c.adherence < 60 ? 'danger' : c.adherence < 75 ? 'warn' : 'brand'} className="max-w-[70px]" />
                        <span className="text-[11.5px] text-muted">{c.adherence}%</span>
                      </div>
                    </div>
                    <div>
                      {c.archived ? (
                        <Badge tone="neutral">Archivado</Badge>
                      ) : (
                        <Badge tone={st === 'activo' ? 'brand' : st === 'por_vencer' ? 'warn' : st === 'pausado' ? 'neutral' : 'danger'} dot={STATUS_META[st].dot}>
                          {STATUS_META[st].label}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-medium">{mxn(c.price)}</p>
                      <p className="text-[10.5px] text-muted">/ mes</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Móvil */}
            <div className="divide-y divide-line lg:hidden">
              {filtered.map((c) => {
                const st = clientStatus(c)
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={c.name} color={avatarColor(c.id)} />
                    <button
                      onClick={() => navigate(`/clientes/${c.id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-[14px] font-medium">{c.name}</p>
                      <p className="text-[11.5px] text-muted">{c.goal} · {mxn(c.price)}/mes</p>
                      <div className="mt-1 flex items-center gap-2">
                        {c.archived ? (
                          <Badge tone="neutral">Archivado</Badge>
                        ) : (
                          <Badge tone={st === 'activo' ? 'brand' : st === 'por_vencer' ? 'warn' : st === 'pausado' ? 'neutral' : 'danger'}>
                            {st === 'vencido' ? `${Math.abs(daysLeft(c.endDate))} d vencido` : STATUS_META[st].label}
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted">vence {fmtDateShort(c.endDate)}</span>
                      </div>
                    </button>
                    {c.archived && (
                      <button
                        onClick={() => { restoreClient(c.id); notify('Cliente restaurado') }}
                        className="rounded-lg border border-line p-2 text-muted"
                        aria-label="Restaurar"
                      >
                        <RotateCcw size={15} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      <p className="mt-3 flex items-center gap-2 text-[11.5px] text-muted">
        <Search size={13} /> Los clientes archivados conservan todo su historial y salen del padrón activo.
      </p>

      <Modal
        open={openNew}
        onClose={closeNew}
        title="Nuevo cliente"
        subtitle="Datos básicos y membresía de 30 días"
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-muted">La membresía inicia hoy y dura 30 días.</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={closeNew}>Cancelar</Button>
              <Button size="sm" onClick={submit}>Guardar cliente</Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo" className="sm:col-span-2">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. María López" autoFocus />
          </Field>
          <Field label="Usuario de acceso" hint="Con este usuario entra el cliente. Si lo dejas vacío se genera del nombre.">
            <input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="maria.lopez" autoCapitalize="none" autoComplete="off" />
          </Field>
          <Field label="Contraseña inicial" hint={PASSWORD_HINT}>
            <div className="flex items-center gap-2">
              <input className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Contraseña temporal" autoCapitalize="none" autoComplete="off" />
              <button
                type="button"
                onClick={() => setForm({ ...form, password: freshPassword() })}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted hover:text-ink"
                title="Generar contraseña"
                aria-label="Generar contraseña"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </Field>
          <Field label="Teléfono (WhatsApp)">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="55 1234 5678" inputMode="tel" />
          </Field>
          <Field label="Correo">
            <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.mx" type="email" />
          </Field>
          <Field label="Objetivo">
            <select className={inputClass} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
              {['Pérdida de grasa', 'Ganancia muscular', 'Recomposición', 'Fuerza', 'Salud general'].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Sexo" hint="Requerido para las fórmulas antropométricas.">
            <select className={inputClass} value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value as 'masculino' | 'femenino' })}>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
            </select>
          </Field>
          <Field label="Coach asignado">
            <select className={inputClass} value={form.coachId} onChange={(e) => setForm({ ...form, coachId: e.target.value })} disabled={viewRole === 'coach'}>
              {coaches.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Inicio de membresía">
            <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="Mensualidad (MXN)">
            <input className={inputClass} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="numeric" />
          </Field>
        </div>
        {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
      </Modal>

      <Modal
        open={Boolean(created)}
        onClose={closeCreated}
        title="Acceso del cliente"
        subtitle={created ? `${created.name} ya puede entrar con su usuario` : ''}
        footer={
          <div className="flex justify-end">
            <Button size="sm" onClick={closeCreated}>Entendido</Button>
          </div>
        }
      >
        {created && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Usuario">
                <div className="flex items-center gap-2">
                  <input className={inputClass} value={created.username} readOnly />
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(created.username)
                      notify('Usuario copiado')
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted hover:text-ink"
                    aria-label="Copiar usuario"
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </Field>
              <Field label="Contraseña visible">
                <div className="flex items-center gap-2">
                  <input className={cx(inputClass, 'font-mono tracking-wide')} value={created.password} readOnly />
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(created.password)
                      notify('Contraseña copiada')
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted hover:text-ink"
                    aria-label="Copiar contraseña"
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </Field>
            </div>
            <p className="mt-4 rounded-xl bg-canvas px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
              Comparte estos datos con el cliente. Puede cambiar la contraseña desde su cuenta.
            </p>
          </>
        )}
      </Modal>
    </>
  )
}
