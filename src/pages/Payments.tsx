import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle, Check, CheckCircle2, Clock, FileText, Plus, ShieldCheck, Trash2, Wallet, X,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { useScopedClients } from '../lib/hooks'
import type { Payment } from '../types'
import { ROLE_LABEL } from '../types'
import { avatarColor, fmtDate, mxn, todayISO } from '../lib/format'
import {
  Avatar, Badge, Button, Card, CardHeader, CopyButton, EmptyState, Field, Modal, PageHeader, SearchInput, Stat, Tabs, cx, inputClass,
} from '../components/ui'

type Filter = 'pendiente' | 'aprobado' | 'rechazado' | 'todos'

export default function Payments() {
  const { payments, reviewPayment, registerPayment, deletePayment, settings, viewRole, notify, clients, currentUser } = useApp()
  const scoped = useScopedClients()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('pendiente')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(params.get('nuevo') === '1')
  const [form, setForm] = useState({ clientId: '', amount: '', reference: '', date: todayISO() })

  const visible = payments
  const canApprove = viewRole === 'admin'
  const canRegister = viewRole === 'coach' || viewRole === 'admin'

  const counts = {
    pendiente: visible.filter((p) => p.status === 'pendiente').length,
    aprobado: visible.filter((p) => p.status === 'aprobado').length,
    rechazado: visible.filter((p) => p.status === 'rechazado').length,
    todos: visible.length,
  }

  const list = useMemo(() => {
    let l = [...visible]
    if (filter !== 'todos') l = l.filter((p) => p.status === filter)
    if (query.trim()) {
      const q = query.toLowerCase()
      l = l.filter((p) => {
        const c = clients.find((x) => x.id === p.clientId)
        return p.reference.toLowerCase().includes(q) || (c?.name.toLowerCase().includes(q) ?? false) || (p.clientName?.toLowerCase().includes(q) ?? false)
      })
    }
    return l.sort((a, b) => b.date.localeCompare(a.date))
  }, [visible, filter, query, clients])

  const pendingAmount = visible.filter((p) => p.status === 'pendiente').reduce((s, p) => s + p.amount, 0)
  const month = new Date().toISOString().slice(0, 7)
  const approvedMonth = visible.filter((p) => p.status === 'aprobado' && p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0)
  const expected = scoped.filter((c) => !c.archived).reduce((s, c) => s + c.price, 0)

  const closeModal = () => {
    setOpen(false)
    if (params.get('nuevo')) {
      params.delete('nuevo')
      setParams(params, { replace: true })
    }
  }

  // El monto manda: los meses se derivan del monto contra el precio mensual
  // del cliente seleccionado (p. ej. $2,000 con plan de $2,000/mes = 1 mes · 30 días).
  const selected = scoped.find((c) => c.id === form.clientId)
  const amountNum = Number(form.amount)
  const months =
    selected && selected.price > 0 && Number.isFinite(amountNum) && amountNum > 0
      ? Math.round(amountNum / selected.price)
      : 0
  const days = months * 30

  const openForm = () => {
    const first = scoped.find((c) => !c.archived)
    setForm({
      clientId: first?.id ?? '',
      amount: String(first?.price ?? 2000),
      reference: '',
      date: todayISO(),
    })
    setOpen(true)
  }

  // Eliminar pago (solo admin): si estaba aprobado, la membresía regresa a los
  // días previos a ese pago y la referencia queda libre para reutilizarla.
  const [toDelete, setToDelete] = useState<Payment | null>(null)

  return (
    <>
      <PageHeader
        eyebrow="Cobranza"
        title="Membresías y pagos"
        subtitle="Transferencias SPEI conciliadas a mano. Cero comisiones, cero datos de tarjeta."
        actions={
          canRegister ? <Button onClick={openForm}><Plus size={16} /> Registrar pago</Button> : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Por conciliar" value={mxn(pendingAmount)} hint={`${counts.pendiente} transferencias`} icon={<Clock size={16} />} tone={counts.pendiente ? 'warn' : 'neutral'} />
        <Stat label="Cobrado este mes" value={mxn(approvedMonth)} hint={`de ${mxn(expected)} esperados`} icon={<CheckCircle2 size={16} />} tone="brand" />
        <Stat label="Pagos registrados" value={String(counts.todos)} hint="Historial total" icon={<Wallet size={16} />} />
        <Stat label="Rechazados" value={String(counts.rechazado)} hint="Con nota de revisión" icon={<AlertCircle size={16} />} tone={counts.rechazado ? 'danger' : 'neutral'} />
      </div>

      {!canApprove && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-brand" />
          <p className="text-[12.5px] leading-relaxed text-muted">
            {viewRole === 'coach'
              ? 'Como coach puedes registrar transferencias, pero la aprobación corresponde al administrador. Así se evita que quien cobra sea quien valida.'
              : 'El super administrador consulta los pagos en modo lectura. La aprobación corresponde al administrador.'}
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <div className="space-y-3 border-b border-line p-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por cliente o referencia" />
            <Tabs
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              items={[
                { value: 'pendiente', label: 'Pendientes', count: counts.pendiente },
                { value: 'aprobado', label: 'Aprobados', count: counts.aprobado },
                { value: 'rechazado', label: 'Rechazados', count: counts.rechazado },
                { value: 'todos', label: 'Todos', count: counts.todos },
              ]}
            />
          </div>

          {list.length === 0 ? (
            <EmptyState title="Sin pagos en este filtro" description="Cuando registres una transferencia aparecerá aquí para conciliarla." />
          ) : (
            <div className="divide-y divide-line">
              {list.map((p) => {
                const c = clients.find((x) => x.id === p.clientId)
                const clientName = c?.name ?? p.clientName ?? 'Cliente'
                return (
                  <div key={p.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={clientName} color={avatarColor(p.clientId)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13.5px] font-medium">{clientName}</p>
                          <Badge tone={p.status === 'aprobado' ? 'brand' : p.status === 'pendiente' ? 'warn' : 'danger'}>
                            {p.status === 'aprobado' ? 'Aprobado' : p.status === 'pendiente' ? 'Pendiente' : 'Rechazado'}
                          </Badge>
                        </div>
                        <p className="mt-0.5 font-mono text-[11.5px] text-muted">{p.reference}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                          <span>{fmtDate(p.date)}</span>
                          <span>{p.days} días</span>
                          <span>{p.method}</span>
                          {p.receiptName && (
                            <span className="inline-flex items-center gap-1"><FileText size={11} /> {p.receiptName}</span>
                          )}
                          {p.reviewedBy && <span>Revisó: {p.reviewedBy}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[15px] font-semibold">{mxn(p.amount)}</p>
                        {p.status === 'pendiente' && canApprove && (
                          <div className="mt-2 flex gap-1.5">
                            <Button
                              size="sm"
                              className="h-8 px-2.5"
                              onClick={async () => {
                                const res = await reviewPayment(p.id, 'aprobado')
                                if (!res.ok) { notify(res.error ?? 'No se pudo aprobar', 'warn'); return }
                                notify(`Pago aprobado · membresía hasta ${fmtDate(res.endDate ?? '')}`)
                              }}
                            >
                              <Check size={14} /> Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 px-2.5"
                              onClick={async () => {
                                const res = await reviewPayment(p.id, 'rechazado')
                                if (!res.ok) { notify(res.error ?? 'No se pudo rechazar', 'warn'); return }
                                notify('Pago rechazado', 'warn')
                              }}
                            >
                              <X size={14} />
                            </Button>
                          </div>
                        )}
                        {p.status === 'pendiente' && !canApprove && (
                          <p className="mt-1 text-[10.5px] text-muted">Esperando admin</p>
                        )}
                        {canApprove && (
                          <button
                            onClick={() => setToDelete(p)}
                            aria-label={`Eliminar pago ${p.reference}`}
                            title="Eliminar pago"
                            className="mt-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Datos de transferencia" subtitle="Compártelos con tus clientes" />
            <div className="space-y-2.5 px-4 pb-4">
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[10.5px] uppercase tracking-wider text-muted">Banco</p>
                <p className="text-[13px] font-medium">{settings.bank}</p>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10.5px] uppercase tracking-wider text-muted">CLABE</p>
                    <p className="font-mono text-[12px] font-medium break-all">{settings.clabe}</p>
                  </div>
                  <CopyButton value={settings.clabe} label="CLABE" withText />
                </div>
              </div>
              {settings.bank2 && (
                <div className="rounded-xl bg-canvas p-3">
                  <p className="text-[10.5px] uppercase tracking-wider text-muted">Banco 2</p>
                  <p className="text-[13px] font-medium">{settings.bank2}</p>
                </div>
              )}
              {settings.clabe2 && (
                <div className="rounded-xl bg-canvas p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10.5px] uppercase tracking-wider text-muted">CLABE 2</p>
                      <p className="font-mono text-[12px] font-medium break-all">{settings.clabe2}</p>
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
              <p className="text-[11px] leading-relaxed text-muted">
                Pide al cliente usar la referencia <span className="font-mono">ENT-XX-####</span> para conciliar más rápido.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Reglas de conciliación" />
            <ul className="space-y-2 px-5 pb-5 text-[11.5px] leading-relaxed text-muted">
              <li>• Una referencia no puede aprobarse dos veces.</li>
              <li>• El monto manda: los días se derivan del monto contra el precio mensual del cliente.</li>
              <li>• Aprobar extiende la membresía los días que el pago cubra.</li>
              <li>• El administrador puede eliminar un pago (basura en la tarjeta); si estaba aprobado, se restan sus días de la membresía y la referencia queda libre.</li>
              <li>• Si el cliente estaba vencido, se cuenta desde hoy.</li>
              <li>• Cada cambio queda en auditoría con nombre y hora.</li>
            </ul>
          </Card>

          <p className="px-1 text-[11px] text-muted">
            Sesión: {currentUser?.name} · {viewRole ? ROLE_LABEL[viewRole] : ''}
          </p>
        </div>
      </div>

      <Modal
        open={open}
        onClose={closeModal}
        title="Registrar pago"
        subtitle="Queda pendiente hasta que un administrador lo apruebe"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={closeModal}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!form.clientId || !form.amount || months < 1}
              onClick={async () => {
                const res = await registerPayment({
                  clientId: form.clientId,
                  amount: Number(form.amount),
                  reference: form.reference,
                  date: form.date,
                  days,
                })
                if (!res.ok) { notify(res.error ?? 'No se pudo registrar', 'warn'); return }
                closeModal()
                notify(`Pago registrado · ${days} días al aprobarse`)
              }}
            >
              Registrar pago
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" className="sm:col-span-2">
            <select
              className={inputClass}
              value={form.clientId}
              onChange={(e) => {
                const c = scoped.find((x) => x.id === e.target.value)
                setForm({
                  ...form,
                  clientId: e.target.value,
                  amount: String(c?.price ?? 0),
                  reference: '',
                })
              }}
            >
              <option value="">Selecciona un cliente</option>
              {scoped.filter((c) => !c.archived).map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {mxn(c.price)}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Monto (MXN)"
            hint={
              months >= 1 && selected
                ? `Cubre ${months} ${months === 1 ? 'mes' : 'meses'} · ${days} días al precio de ${mxn(selected.price)}/mes.`
                : 'Los días se calculan del monto contra el precio mensual del cliente.'
            }
          >
            <input className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" />
          </Field>
          <Field label="Fecha">
            <input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Referencia / folio (opcional)" className="sm:col-span-2" hint="Si la dejas vacía se genera una interna. Ayuda a detectar comprobantes duplicados.">
            <input className={cx(inputClass, 'font-mono text-[13px]')} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* Confirmación para eliminar un pago (solo admin). */}
      <Modal
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Eliminar pago"
        subtitle={toDelete ? `${toDelete.reference} · ${mxn(toDelete.amount)}` : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!toDelete) return
                const res = await deletePayment(toDelete.id)
                if (!res.ok) { notify(res.error ?? 'No se pudo eliminar', 'warn'); return }
                notify(
                  toDelete.status === 'aprobado'
                    ? `Pago eliminado · membresía hasta ${fmtDate(res.endDate ?? '')}`
                    : 'Pago eliminado',
                  'warn',
                )
                setToDelete(null)
              }}
            >
              Eliminar
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          {toDelete?.status === 'aprobado'
            ? 'Este pago estaba aprobado: la membresía regresa a los días que tenía antes de ese pago. El registro se libera y su referencia queda disponible para reutilizarla.'
            : 'El registro se elimina y su referencia queda disponible para reutilizarla. Esta acción no se puede deshacer.'}
        </p>
      </Modal>
    </>
  )
}
