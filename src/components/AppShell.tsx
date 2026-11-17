import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Dumbbell, UtensilsCrossed, Wallet, ShieldCheck,
  ScrollText, Settings, LogOut, Menu, X, Activity, MoreHorizontal, BookOpen, UserCog,
  ArrowLeftRight,
} from 'lucide-react'
import type { ModuleCode } from '../types'
import { ROLE_LABEL } from '../types'
import { useApp } from '../store/AppStore'
import { avatarColor } from '../lib/format'
import { PASSWORD_HINT, passwordProblem } from '../lib/password'
import { Avatar, Badge, Button, Field, Modal, cx, inputClass } from './ui'
import ThemeToggle from './ThemeToggle'

const NAV: Array<{ module: ModuleCode; to: string; label: string; short: string; icon: typeof Users }> = [
  { module: 'inicio', to: '/', label: 'Inicio', short: 'Inicio', icon: LayoutDashboard },
  { module: 'clientes', to: '/clientes', label: 'Clientes', short: 'Clientes', icon: Users },
  { module: 'rutinas', to: '/rutinas', label: 'Rutinas', short: 'Rutinas', icon: Dumbbell },
  { module: 'rutinas', to: '/ejercicios', label: 'Ejercicios', short: 'Ejercicios', icon: BookOpen },
  { module: 'planes', to: '/planes', label: 'Planes', short: 'Planes', icon: UtensilsCrossed },
  { module: 'pagos', to: '/pagos', label: 'Pagos', short: 'Pagos', icon: Wallet },
  { module: 'usuarios', to: '/usuarios', label: 'Usuarios', short: 'Usuarios', icon: ShieldCheck },
  { module: 'auditoria', to: '/auditoria', label: 'Auditoría', short: 'Auditoría', icon: ScrollText },
  { module: 'sistema', to: '/sistema', label: 'Sistema', short: 'Sistema', icon: Settings },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white">
        <Activity size={18} strokeWidth={2.4} />
      </span>
      <div className="leading-tight">
        <p className="font-semibold tracking-tight">Entrenamiento</p>
        <p className="text-[10.5px] uppercase tracking-[0.16em] text-muted">Gestión de clientes</p>
      </div>
    </div>
  )
}

export function AppShell() {
  const { viewRole, currentUser, can, logout, switchRole, toast, updateOwnAccount, notify } = useApp()
  const navigate = useNavigate()
  const [mobileMenu, setMobileMenu] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const items = NAV.filter((n) => can(n.module))
  const primary = items.filter((i) => ['/', '/clientes', '/rutinas', '/pagos'].includes(i.to)).slice(0, 4)
  const initialsRole = currentUser ? avatarColor(currentUser.id) : 'bg-sand text-muted'
  // Cuentas multi-rol (p. ej. admin + super admin) cambian de ventana aquí,
  // sin pantalla de selección al entrar.
  const otherRole = currentUser && (currentUser.roles?.length ?? 0) > 1
    ? currentUser.roles?.find((r) => r !== viewRole)
    : undefined

  const go = (to: string) => {
    setMobileMenu(false)
    navigate(to)
  }

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Sidebar escritorio */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pb-5 pt-6">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors',
                  isActive ? 'bg-brand-soft text-brand-dark' : 'text-muted hover:bg-canvas hover:text-ink',
                )
              }
            >
              <item.icon size={18} strokeWidth={2} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className="mb-2 flex items-center justify-between rounded-xl bg-canvas px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium">{currentUser?.name}</p>
              <p className="text-[11px] text-muted">{viewRole ? ROLE_LABEL[viewRole] : ''}</p>
            </div>
            <div className="flex items-center gap-1">
              {otherRole && (
                <button
                  onClick={() => switchRole(otherRole)}
                  title={`Cambiar a ${ROLE_LABEL[otherRole]}`}
                  aria-label={`Cambiar a ${ROLE_LABEL[otherRole]}`}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
                >
                  <ArrowLeftRight size={15} />
                </button>
              )}
              <button
                onClick={() => setAccountOpen(true)}
                title="Mi cuenta"
                className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
              >
                <UserCog size={15} />
              </button>
              <button
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
                title="Cambiar de cuenta"
                className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <Brand />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenu(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-muted lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu size={17} />
            </button>
            <div className="hidden items-center gap-2 lg:flex">
              <Avatar name={currentUser?.name ?? 'P'} color={initialsRole} size="sm" />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Nav inferior móvil */}
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1">
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10.5px] font-medium',
                  isActive ? 'text-brand' : 'text-muted',
                )
              }
            >
              <item.icon size={21} strokeWidth={2} />
              {item.short}
            </NavLink>
          ))}
          <button
            onClick={() => setMobileMenu(true)}
            className="flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10.5px] font-medium text-muted"
          >
            <MoreHorizontal size={21} />
            Más
          </button>
        </div>
      </nav>

      {/* Menú móvil */}
      {mobileMenu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileMenu(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <Brand />
              <button onClick={() => setMobileMenu(false)} className="rounded-lg p-2 text-muted hover:bg-sand">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {items.map((item) => (
                <button
                  key={item.to}
                  onClick={() => go(item.to)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-ink hover:bg-canvas"
                >
                  <item.icon size={19} className="text-muted" />
                  {item.label}
                </button>
              ))}
              <div className="mt-3 border-t border-line pt-4">
                <div className="flex items-center gap-3 px-3">
                  <Avatar name={currentUser?.name ?? 'P'} color={initialsRole} size="sm" />
                  <div>
                    <p className="text-[12.5px] font-medium">{currentUser?.name}</p>
                    <p className="text-[11px] text-muted">{viewRole ? ROLE_LABEL[viewRole] : ''}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-line p-4">
              <div className="mb-3 flex items-center gap-3">
                <Avatar name={currentUser?.name ?? 'P'} color={initialsRole} />
                <div>
                  <p className="text-[13.5px] font-medium">{currentUser?.name}</p>
                  <p className="text-[11.5px] text-muted">{viewRole ? ROLE_LABEL[viewRole] : ''}</p>
                </div>
              </div>
              {otherRole && (
                <button
                  onClick={() => {
                    setMobileMenu(false)
                    switchRole(otherRole)
                  }}
                  aria-label={`Cambiar a ${ROLE_LABEL[otherRole]}`}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm text-muted"
                >
                  <ArrowLeftRight size={15} /> Cambiar rol
                </button>
              )}
              <button
                onClick={() => {
                  setMobileMenu(false)
                  setAccountOpen(true)
                }}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm text-muted"
              >
                <UserCog size={15} /> Mi cuenta
              </button>
              <button
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm text-muted"
              >
                <LogOut size={15} /> Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {accountOpen && currentUser && (
        <StaffAccountModal
          name={currentUser.name}
          onClose={() => setAccountOpen(false)}
          onSubmit={async (data) => {
            const result = await updateOwnAccount(data)
            if (!result.ok) return result.error ?? 'No se pudo actualizar tu cuenta.'
            setAccountOpen(false)
            notify('Tu cuenta se actualizó')
            return null
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 lg:bottom-6">
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

function StaffAccountModal({
  name,
  onClose,
  onSubmit,
}: {
  name: string
  onClose: () => void
  onSubmit: (data: { name?: string; password?: string; currentPassword?: string }) => Promise<string | null>
}) {
  const [fullName, setFullName] = useState(name)
  const [currentPassword, setCurrentPassword] = useState('')
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
      if (!currentPassword) {
        setError('Escribe tu contraseña actual para cambiarla.')
        return
      }
    }
    setBusy(true)
    const message = await onSubmit({
      name: fullName.trim(),
      ...(newPassword ? { password: newPassword, currentPassword } : {}),
    })
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Mi cuenta"
      subtitle="Cambia tu nombre o contraseña de acceso"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Nombre">
          <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </Field>
        <div className="rounded-xl bg-canvas px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
          Para cambiar la contraseña necesitas escribir la actual. Las demás sesiones se cerrarán.
        </div>
        <Field label="Contraseña actual">
          <input
            className={inputClass}
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field label="Contraseña nueva" hint={PASSWORD_HINT}>
          <input
            className={inputClass}
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Repite la contraseña nueva">
          <input
            className={inputClass}
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </div>
      {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p>}
    </Modal>
  )
}

export function AccessDenied({ module }: { module: string }) {
  const { viewRole } = useApp()
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <Badge tone="warn">Módulo desactivado</Badge>
      <h1 className="mt-3 text-xl font-semibold">Este módulo no está activado para tu rol</h1>
      <p className="mt-2 text-sm text-muted">
        El rol <strong>{viewRole ? ROLE_LABEL[viewRole] : ''}</strong> no tiene acceso a {module}. Un super
        administrador puede activarlo desde Sistema → Módulos.
      </p>
    </div>
  )
}
