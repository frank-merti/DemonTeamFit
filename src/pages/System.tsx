import { useEffect, useState } from 'react'
import {
  AlertTriangle, Check, Database, Download, HardDriveDownload, Landmark,
  RefreshCw, Save, ToggleLeft,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { fmtDate, todayISO } from '../lib/format'
import { ApiError, apiBackups, apiDownloadBackup, apiSystemSummary } from '../lib/api'
import type { ModuleCode, Role } from '../types'
import { ALL_MODULES, MODULE_LABEL, ROLE_LABEL } from '../types'
import { Badge, Button, Card, CardHeader, Field, PageHeader, cx, inputClass } from '../components/ui'

const ROLES: Role[] = ['cliente', 'coach', 'admin', 'super_admin']

interface BackupRow {
  key: string
  size: number
  uploaded: string
  date: string
}

export default function System() {
  const {
    settings, updateSettings, toggleModule, runBackup, notify, audit,
  } = useApp()
  const [bank, setBank] = useState(settings.bank)
  const [bank2, setBank2] = useState(settings.bank2)
  const [clabe, setClabe] = useState(settings.clabe)
  const [clabe2, setClabe2] = useState(settings.clabe2)
  const [alias, setAlias] = useState(settings.alias)
  const [coachPhone, setCoachPhone] = useState(settings.coachPhone)
  const [backups, setBackups] = useState<BackupRow[]>([])
  const [summary, setSummary] = useState({ activeClients: 0, totalClients: 0, payments: 0, users: 0 })
  const [busy, setBusy] = useState(false)

  const enabledCount = Object.values(settings.roleModules).flat().length

  const refreshData = async () => {
    const [backupResult, summaryResult] = await Promise.allSettled([apiBackups(), apiSystemSummary()])
    setBackups(backupResult.status === 'fulfilled' ? backupResult.value.backups : [])
    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value.summary)
  }

  useEffect(() => {
    void refreshData()
  }, [])

  const saveSettings = async () => {
    const res = await updateSettings({ bank, bank2, clabe, clabe2, alias, coachPhone })
    if (!res.ok) {
      notify(res.error ?? 'No se pudo guardar', 'warn')
      return
    }
    notify('Configuración guardada')
  }

  const backupNow = async () => {
    setBusy(true)
    const res = await runBackup()
    if (res.ok) await refreshData()
    setBusy(false)
    if (!res.ok) return
  }

  const download = async (key?: string) => {
    try {
      const blob = await apiDownloadBackup(key)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `entrenamiento-${todayISO()}.sql`
      link.click()
      URL.revokeObjectURL(url)
      notify('Copia descargada')
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'No se pudo descargar.', 'warn')
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Plataforma"
        title="Sistema y respaldos"
        subtitle="Solo el super administrador ve esta sección. Sin acceso a datos clínicos."
        actions={<Badge tone="warn">Acceso exclusivo</Badge>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-[11.5px] text-muted">Último respaldo</p>
          <p className="mt-1 text-[18px] font-semibold leading-none">{settings.lastBackup ? fmtDate(settings.lastBackup) : 'Sin respaldos'}</p>
          <p className="mt-1.5 text-[11px] text-muted">Diario automático en la nube privada</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] text-muted">Asignaciones de módulo</p>
          <p className="mt-1 text-[24px] font-semibold leading-none">{enabledCount}</p>
          <p className="mt-1.5 text-[11px] text-muted">repartidos en {ROLES.length} roles</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Módulos activados por rol"
              subtitle="Desactivar un módulo lo oculta del menú y corta sus endpoints, no borra datos"
              action={<Badge tone="brand"><ToggleLeft size={12} /> En vivo</Badge>}
            />
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead className="bg-canvas/60 text-[10.5px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Módulo</th>
                    {ROLES.map((r) => (
                      <th key={r} className="px-2 py-2.5 text-center font-semibold">{ROLE_LABEL[r].split(' ')[0]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_MODULES.map((m: ModuleCode) => (
                    <tr key={m} className="border-t border-line/70">
                      <td className="px-4 py-2.5 font-medium">{MODULE_LABEL[m]}</td>
                      {ROLES.map((r) => {
                        const enabled = settings.roleModules[r].includes(m)
                        return (
                          <td key={r} className="px-2 py-2.5 text-center">
                            <button
                              onClick={() => {
                                void toggleModule(r, m)
                                notify(`${MODULE_LABEL[m]} ${enabled ? 'desactivado' : 'activado'} para ${ROLE_LABEL[r]}`)
                              }}
                              aria-label={`${enabled ? 'Desactivar' : 'Activar'} ${MODULE_LABEL[m]} para ${ROLE_LABEL[r]}`}
                              className={cx(
                                'mx-auto grid h-6 w-6 place-items-center rounded-md border transition-colors',
                                enabled ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-transparent hover:border-muted',
                              )}
                            >
                              <Check size={13} strokeWidth={3} />
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-start gap-2 border-t border-line px-4 py-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
              <p className="text-[11px] leading-relaxed text-muted">
                Si desactivas <strong className="text-ink">Sistema</strong> para super administrador, perderás
                esta pantalla. Otro super administrador tendría que reactivarla desde la base de datos.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Respaldo y portabilidad" subtitle="Volcado SQL estándar guardado en almacenamiento privado" />
            <div className="space-y-3 px-4 pb-4">
              <div className="rounded-xl bg-canvas p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <Database size={15} className="text-brand" />
                    <span className="font-medium">entrenamiento-{settings.lastBackup || 'sin-fecha'}.sql</span>
                    <Badge tone="brand">{backups[0] ? `${Math.round(backups[0].size / 1024)} KB` : 'sin archivo'}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={backupNow} disabled={busy}>
                      <RefreshCw size={14} /> {busy ? 'Respaldando…' : 'Respaldar ahora'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void download()}>
                      <Download size={14} /> Descargar
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  El cron diario guarda un volcado en la nube privada con retención de 8 semanas. Puedes descargar la
                  copia más reciente y guardarla en tu equipo o unidad externa. Sin Google Drive ni
                  credenciales de terceros.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['Clientes', summary.totalClients],
                  ['Pagos', summary.payments],
                  ['Cuentas', summary.users],
                ].map(([label, n]) => (
                  <div key={label as string} className="rounded-xl border border-line py-2">
                    <p className="text-[15px] font-semibold">{n}</p>
                    <p className="text-[10.5px] text-muted">{label}</p>
                  </div>
                ))}
              </div>
              {backups.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">Respaldos recientes</p>
                  {backups.slice(0, 5).map((backup) => (
                    <button
                      key={backup.key}
                      onClick={() => void download(backup.key)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-left text-[11.5px] hover:bg-canvas"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <HardDriveDownload size={14} className="shrink-0 text-muted" />
                        <span className="truncate font-mono">{backup.key}</span>
                      </span>
                      <span className="shrink-0 text-muted">{Math.round(backup.size / 1024)} KB</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="border-dashed bg-canvas/50">
            <div className="p-4">
              <p className="text-[12px] font-medium">Privacidad clínica</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Tu rol no ve antropometría, rutinas ni planes, y no existe acceso de excepción.
                La auditoría es de solo lectura y se verifica con una cadena de hashes.
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Datos de cobro" subtitle="Se muestran al cliente para transferir" />
            <div className="space-y-3 px-4 pb-4">
              <Field label="Banco">
                <div className="relative">
                  <Landmark size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input className={cx(inputClass, 'pl-9')} value={bank} onChange={(e) => setBank(e.target.value)} />
                </div>
              </Field>
              <Field label="CLABE">
                <input className={cx(inputClass, 'font-mono text-[13px]')} value={clabe} onChange={(e) => setClabe(e.target.value)} />
              </Field>
              <Field label="Banco 2 (cuenta alterna)">
                <div className="relative">
                  <Landmark size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input className={cx(inputClass, 'pl-9')} value={bank2} onChange={(e) => setBank2(e.target.value)} />
                </div>
              </Field>
              <Field label="CLABE 2 (cuenta alterna)">
                <input className={cx(inputClass, 'font-mono text-[13px]')} value={clabe2} onChange={(e) => setClabe2(e.target.value)} />
              </Field>
              <Field label="Alias">
                <input className={cx(inputClass, 'font-mono text-[13px]')} value={alias} onChange={(e) => setAlias(e.target.value)} />
              </Field>
              <Field label="WhatsApp del coach" hint="Los clientes lo usan para enviarte dudas y comprobantes.">
                <input className={cx(inputClass, 'font-mono text-[13px]')} value={coachPhone} onChange={(e) => setCoachPhone(e.target.value)} inputMode="tel" placeholder="722 000 0000" />
              </Field>
              <Button size="sm" variant="secondary" onClick={() => void saveSettings()} className="w-full"><Save size={14} /> Guardar datos</Button>
            </div>
          </Card>

          <p className="px-1 text-[10.5px] text-muted">
            {audit.length} eventos de auditoría
          </p>
        </div>
      </div>
    </>
  )
}
