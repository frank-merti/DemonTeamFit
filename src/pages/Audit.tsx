import { useMemo, useState } from 'react'
import { AlertTriangle, Download, History, Lock, ShieldCheck } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { relative, todayISO } from '../lib/format'
import type { Role } from '../types'
import { ROLE_LABEL } from '../types'
import { Badge, Button, Card, EmptyState, PageHeader, SearchInput, Tabs, cx } from '../components/ui'

const ROLE_TONE: Record<Role, 'brand' | 'info' | 'warn' | 'neutral'> = {
  cliente: 'neutral',
  coach: 'brand',
  admin: 'info',
  super_admin: 'warn',
}

const ACTION_LABEL: Record<string, string> = {
  'client.create': 'Alta de cliente',
  'client.update': 'Edición de ficha',
  'client.archive': 'Archivo de cliente',
  'client.restore': 'Restauración de cliente',
  'anthropometry.create': 'Medición registrada',
  'routine.save': 'Rutina guardada',
  'routine.assign': 'Rutina asignada',
  'mealplan.save': 'Plan guardado',
  'mealplan.assign': 'Plan asignado',
  'payment.register': 'Pago registrado',
  'payment.approve': 'Pago aprobado',
  'payment.reject': 'Pago rechazado',
  'user.create': 'Alta de cuenta',
  'user.save': 'Usuario guardado',
  'user.toggle': 'Estado de cuenta',
  'module.toggle': 'Módulo cambiado',
  'settings.update': 'Configuración',
  'backup.run': 'Respaldo ejecutado',
  'backup.download': 'Respaldo descargado',
  'audit.verify': 'Cadena verificada',
  'auth.login': 'Inicio de sesión',
  'auth.login_fail': 'Intento fallido',
  'auth.logout': 'Cierre de sesión',
  'auth.role_switch': 'Cambio de rol',
  'account.self_update': 'Cuenta actualizada',
  'account.password_change': 'Contraseña cambiada',
  'password.view': 'Contraseña consultada',
  'password.view_self': 'Contraseña propia consultada',
  'password.reset': 'Contraseña restablecida',
}

type VerifyState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ok'; checked: number }
  | { status: 'broken'; checked: number; brokenAt: string | null }
  | { status: 'error'; message: string }

export default function Audit() {
  const { audit, viewRole, verifyAudit } = useApp()
  const [query, setQuery] = useState('')
  const [actor, setActor] = useState<'todos' | Role>('todos')
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' })

  const isSuper = viewRole === 'super_admin'

  const filtered = useMemo(() => {
    let list = [...audit]
    if (actor !== 'todos') list = list.filter((a) => a.actorRole === actor)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((a) => `${a.actor} ${a.action} ${a.detail} ${a.entity}`.toLowerCase().includes(q))
    }
    return list
  }, [audit, actor, query])

  const runVerify = async () => {
    setVerify({ status: 'running' })
    const result = await verifyAudit()
    if (result.error) {
      setVerify({ status: 'error', message: result.error })
      return
    }
    setVerify(
      result.ok
        ? { status: 'ok', checked: result.checked }
        : { status: 'broken', checked: result.checked, brokenAt: result.brokenAt ?? null },
    )
  }

  const exportCsv = () => {
    const rows = [
      ['fecha', 'actor', 'rol', 'accion', 'entidad', 'detalle', 'hash'],
      ...filtered.map((a) => [
        a.at, a.actor, a.actorRole, a.action, a.entity,
        a.detail.replace(/"/g, '""'), a.hash ?? '',
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auditoria-entrenamiento-${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        eyebrow="Trazabilidad"
        title="Auditoría"
        subtitle="Registro inmutable de cada cambio: quién, qué, cuándo y sobre qué registro."
        actions={<Button variant="secondary" onClick={exportCsv}><Download size={16} /> Exportar CSV</Button>}
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3">
        <Lock size={15} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-[11.5px] leading-relaxed text-muted">
          El registro es de solo lectura y vive en una tabla <strong className="text-ink">append-only</strong> con
          cadena de hashes SHA-256. Ni el administrador puede borrar entradas. El super administrador puede
          verificar la cadena completa contra la base de datos.
        </p>
      </div>

      {isSuper && (
        <Card className="mb-4 overflow-hidden">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={17} className="mt-0.5 shrink-0 text-brand" />
              <div>
                <p className="text-[13px] font-semibold">Verificación de cadena</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                  Recalcula cada hash y confirma que ninguna fila fue alterada ni reordenada.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={verify.status === 'broken' ? 'secondary' : 'primary'}
              onClick={() => void runVerify()}
              disabled={verify.status === 'running'}
            >
              <ShieldCheck size={14} /> {verify.status === 'running' ? 'Verificando…' : 'Verificar cadena'}
            </Button>
          </div>
          {verify.status === 'ok' && (
            <div className="flex items-center gap-2 border-t border-line bg-canvas/60 px-4 py-2.5 text-[12px]">
              <Badge tone="brand">Íntegra</Badge>
              <span className="text-muted">{verify.checked} eventos verificados sin alteraciones.</span>
            </div>
          )}
          {verify.status === 'broken' && (
            <div className="flex items-start gap-2 border-t border-line bg-canvas/60 px-4 py-2.5 text-[12px]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
              <span className="text-muted">
                <strong className="text-ink">Cadena rota.</strong> Se revisaron {verify.checked} eventos y la
                alteración aparece en <span className="font-mono">{verify.brokenAt ?? 'una fila sin id'}</span>.
                Restaura desde un respaldo y revisa quién tuvo acceso.
              </span>
            </div>
          )}
          {verify.status === 'error' && (
            <div className="flex items-start gap-2 border-t border-line bg-canvas/60 px-4 py-2.5 text-[12px] text-muted">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
              <span>{verify.message}</span>
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por actor, acción o detalle" />
          </div>
          <Tabs
            value={actor}
            onChange={(v) => setActor(v as typeof actor)}
            items={[
              { value: 'todos', label: 'Todos' },
              { value: 'coach', label: 'Coach' },
              { value: 'admin', label: 'Admin' },
              { value: 'super_admin', label: 'Súper' },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="Sin registros" description="No hay movimientos que coincidan con el filtro." />
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((a) => (
              <div key={a.id} className="flex gap-3 px-4 py-3.5">
                <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-canvas text-muted')}>
                  <History size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-medium">{a.actor}</p>
                    <Badge tone={ROLE_TONE[a.actorRole]}>{ROLE_LABEL[a.actorRole]}</Badge>
                    <span className="text-[11px] text-muted">{relative(a.at)}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink">{ACTION_LABEL[a.action] ?? a.action}</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{a.detail}</p>
                  <p className="mt-1 font-mono text-[10.5px] text-muted/70">
                    {a.entity}{a.entityId ? ` · ${a.entityId}` : ''} · {new Date(a.at).toLocaleString('es-MX')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-muted">{filtered.length} de {audit.length} movimientos · retención 24 meses</p>
    </>
  )
}
