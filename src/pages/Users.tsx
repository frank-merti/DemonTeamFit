import { useState } from 'react'
import { CheckCircle2, Copy, Eye, KeyRound, Plus, Shield, UserCog, Users as UsersIcon, XCircle } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { avatarColor } from '../lib/format'
import type { Role } from '../types'
import { ROLE_LABEL } from '../types'
import { Avatar, Badge, Button, Card, CardHeader, Field, Modal, PageHeader, Stat, cx, inputClass } from '../components/ui'
import { PASSWORD_HINT, generateTemporaryPassword, passwordProblem } from '../lib/password'
import { ApiError, apiResetStaffPassword, apiViewUserPassword } from '../lib/api'

const ROLE_TONE: Record<Role, 'brand' | 'info' | 'warn' | 'neutral'> = {
  cliente: 'neutral',
  coach: 'brand',
  admin: 'info',
  super_admin: 'warn',
}

export default function UsersPage() {
  const { users, viewRole, saveUser, toggleUser, notify, resetClientPassword } = useApp()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', username: '', password: '', email: '', phone: '', role: 'coach' as Role })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string; kind: 'cliente' | 'coach' } | null>(null)
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState('')
  const [viewTarget, setViewTarget] = useState<{ id: string; name: string } | null>(null)
  const [viewData, setViewData] = useState<{ username: string; password: string } | null>(null)
  const [viewBusy, setViewBusy] = useState(false)
  const [viewError, setViewError] = useState('')

  const isSuper = viewRole === 'super_admin'
  const canResetPasswords = viewRole === 'admin'
  const allowedRoles: Role[] = isSuper ? ['coach', 'admin', 'super_admin'] : ['coach']

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Nombre y correo son obligatorios.')
      return
    }
    if (!form.username.trim()) {
      setError('El usuario es obligatorio.')
      return
    }
    const problem = passwordProblem(form.password)
    if (problem) {
      setError(problem)
      return
    }
    if (users.some((u) => u.username.toLowerCase() === form.username.trim().toLowerCase())) {
      setError('Ese nombre de usuario ya está en uso.')
      return
    }
    setBusy(true)
    const result = await saveUser({
      id: '',
      username: form.username.trim(),
      password: form.password,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone,
      role: form.role,
      roles: [form.role],
      active: true,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'No se pudo crear la cuenta.')
      return
    }
    setOpen(false)
    setForm({ name: '', username: '', password: '', email: '', phone: '', role: 'coach' })
    setError('')
    notify('Usuario creado · comparte su usuario y contraseña de forma segura')
  }

  const openReset = (user: { id: string; name: string; role: Role }) => {
    setResetError('')
    setResetResult(null)
    setResetTarget({
      id: user.id,
      name: user.name,
      kind: user.role === 'cliente' ? 'cliente' : 'coach',
    })
  }

  const closeReset = () => {
    setResetTarget(null)
    setResetResult(null)
    setResetError('')
  }

  const openView = (user: { id: string; name: string }) => {
    setViewError('')
    setViewData(null)
    setViewTarget({ id: user.id, name: user.name })
  }

  const closeView = () => {
    setViewTarget(null)
    setViewData(null)
    setViewError('')
  }

  /** Consulta la contraseña vigente; el backend la descifra y audita la vista. */
  const confirmView = async () => {
    if (!viewTarget) return
    setViewBusy(true)
    setViewError('')
    try {
      const data = await apiViewUserPassword(viewTarget.id)
      setViewData(data)
    } catch (error) {
      setViewError(error instanceof ApiError ? error.message : 'No se pudo consultar la contraseña.')
    } finally {
      setViewBusy(false)
    }
  }

  const confirmReset = async () => {
    if (!resetTarget) return
    setResetBusy(true)
    setResetError('')
    try {
      if (resetTarget.kind === 'cliente') {
        const data = await resetClientPassword(resetTarget.id)
        if (!data) {
          setResetError('No se pudo restablecer la contraseña.')
          return
        }
        setResetResult({ name: resetTarget.name, password: data.password })
        return
      }
      const password = generateTemporaryPassword()
      await apiResetStaffPassword(resetTarget.id, password)
      notify('Contraseña restablecida · compártela de forma segura')
      setResetResult({ name: resetTarget.name, password })
    } catch (error) {
      setResetError(error instanceof ApiError ? error.message : 'No se pudo restablecer.')
    } finally {
      setResetBusy(false)
    }
  }

  const visible = users.filter((u) => (isSuper ? true : u.role !== 'super_admin' && !(u.role === 'admin' && u.id !== 'u-admin-1')))

  return (
    <>
      <PageHeader
        eyebrow="Accesos"
        title="Usuarios y roles"
        subtitle="Cuentas del equipo y accesos de clientes"
        actions={
          <Button onClick={() => setOpen(true)}><Plus size={16} /> Invitar usuario</Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cuentas activas" value={String(users.filter((u) => u.active).length)} hint={`${users.length} en total`} icon={<UsersIcon size={16} />} tone="brand" />
        <Stat label="Coaches" value={String(users.filter((u) => u.role === 'coach').length)} hint="Acceso al padrón asignado" icon={<UserCog size={16} />} />
        <Stat label="Administradores" value={String(users.filter((u) => u.role === 'admin').length)} hint="Altas, bajas y cobranza" icon={<Shield size={16} />} />
        <Stat label="Clientes con portal" value={String(users.filter((u) => u.role === 'cliente').length)} hint="Acceso a su plan" />
      </div>

      <div className="mt-4">
        <Card className="overflow-hidden">
          <CardHeader title="Padrón de cuentas" subtitle="Activa o desactiva accesos sin borrar su historial" />
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[620px] text-[12.5px]">
              <thead className="bg-canvas/60 text-left text-[10.5px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Usuario</th>
                  <th className="px-3 py-2.5 font-semibold">Rol</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const protectedAccount = u.role === 'super_admin' && !isSuper
                  const canReset = canResetPasswords && (u.role === 'cliente' || u.role === 'coach')
                  return (
                    <tr key={u.id} className="border-t border-line/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.name} color={avatarColor(u.id)} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{u.name}</p>
                            <p className="truncate text-[11px] text-muted">{u.email ? `${u.username} · ${u.email}` : u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={ROLE_TONE[u.role]}>
                          {(u.roles?.length ? u.roles : [u.role]).map((r) => ROLE_LABEL[r]).join(' + ')}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 text-[11.5px] text-brand"><CheckCircle2 size={12} /> Activo</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted"><XCircle size={12} /> Inactivo</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {canResetPasswords && u.recoverable && !protectedAccount && (
                            <button
                              onClick={() => openView(u)}
                              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-muted hover:border-brand/40 hover:text-brand"
                              aria-label={`Ver contraseña de ${u.name}`}
                            >
                              <Eye size={12} /> Ver contraseña
                            </button>
                          )}
                          {canReset && (
                            <button
                              onClick={() => openReset(u)}
                              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-muted hover:border-brand/40 hover:text-brand"
                              aria-label={`Restablecer contraseña de ${u.name}`}
                            >
                              <KeyRound size={12} /> Restablecer
                            </button>
                          )}
                          {!protectedAccount ? (
                            <button
                              onClick={() => {
                                toggleUser(u.id)
                                notify(u.active ? 'Cuenta desactivada' : 'Cuenta reactivada', u.active ? 'warn' : 'ok')
                              }}
                              className={cx(
                                'rounded-lg border px-2.5 py-1 text-[11px] font-medium',
                                u.active ? 'border-line text-muted hover:border-danger/30 hover:text-danger' : 'border-brand/30 text-brand',
                              )}
                            >
                              {u.active ? 'Desactivar' : 'Activar'}
                            </button>
                          ) : (
                            <span className="text-[10.5px] text-muted">Protegida</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="mt-3 text-[11px] text-muted">
        Las altas, bajas, restablecimientos y consultas de contraseña quedan registrados en auditoría.
      </p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invitar usuario"
        subtitle="El acceso de los clientes se crea junto con su expediente"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={submit} disabled={busy}>Crear cuenta</Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo" className="sm:col-span-2">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Valeria Núñez" />
          </Field>
          <Field label="Usuario" hint="Con este nombre inicia sesión.">
            <input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="valeria.nunez" autoCapitalize="none" />
          </Field>
          <Field label="Contraseña" hint={PASSWORD_HINT}>
            <input className={inputClass} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Contraseña temporal" autoCapitalize="none" />
          </Field>
          <Field label="Correo">
            <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@dominio.mx" />
          </Field>
          <Field label="Teléfono">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="55 0000 0000" />
          </Field>
          <Field label="Rol" className="sm:col-span-2" hint={isSuper ? 'Puedes crear cualquier rol de staff.' : 'Como administrador solo puedes crear coaches.'}>
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </Field>
        </div>
        {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        onClose={closeReset}
        title="Restablecer contraseña"
        subtitle="Se cerrarán todas las sesiones abiertas de esta cuenta"
        footer={
          <div className="flex justify-end gap-2">
            {resetResult ? (
              <Button size="sm" onClick={closeReset}>Listo</Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={closeReset}>Cancelar</Button>
                <Button size="sm" onClick={() => void confirmReset()} disabled={resetBusy}>
                  {resetBusy ? 'Restableciendo…' : 'Confirmar restablecimiento'}
                </Button>
              </>
            )}
          </div>
        }
      >
        {resetResult ? (
          <>
            <p className="text-[12.5px] leading-relaxed text-muted">
              Comparte esta contraseña temporal con <strong className="text-ink">{resetResult.name}</strong>.
              Al entrar, podrá cambiarla desde <strong className="text-ink">Mi cuenta</strong>.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[13.5px]">{resetResult.password}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(resetResult.password)
                  notify('Contraseña copiada')
                }}
              >
                <Copy size={14} /> Copiar
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted">{PASSWORD_HINT} Se muestra solo una vez.</p>
          </>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Se generará una contraseña temporal para{' '}
            <strong className="text-ink">{resetTarget?.name}</strong>. La verás una sola vez al confirmar.
          </p>
        )}
        {resetError && (
          <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12px] text-danger">{resetError}</p>
        )}
      </Modal>

      <Modal
        open={Boolean(viewTarget)}
        onClose={closeView}
        title="Ver contraseña"
        subtitle="Contraseña vigente de la cuenta"
        footer={
          <div className="flex justify-end gap-2">
            {viewData ? (
              <Button size="sm" onClick={closeView}>Cerrar</Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={closeView}>Cancelar</Button>
                <Button size="sm" onClick={() => void confirmView()} disabled={viewBusy}>
                  {viewBusy ? 'Consultando…' : 'Consultar contraseña'}
                </Button>
              </>
            )}
          </div>
        }
      >
        {viewData ? (
          <>
            <p className="text-[12.5px] leading-relaxed text-muted">
              Con esta contraseña entra <strong className="text-ink">{viewTarget?.name}</strong> (usuario{' '}
              <code className="font-mono text-[12px]">{viewData.username}</code>). Si la cambia desde su
              cuenta, este visor mostrará la nueva.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[13.5px]">{viewData.password}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(viewData.password)
                  notify('Contraseña copiada')
                }}
              >
                <Copy size={14} /> Copiar
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Se descifrará la contraseña actual de <strong className="text-ink">{viewTarget?.name}</strong>.
            Esta consulta queda registrada en la auditoría.
          </p>
        )}
        {viewError && (
          <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12px] text-danger">{viewError}</p>
        )}
      </Modal>
    </>
  )
}
