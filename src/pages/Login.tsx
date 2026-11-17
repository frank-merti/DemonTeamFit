import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, CheckCircle2, Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react'
import type { Role } from '../types'
import { useApp } from '../store/AppStore'
import { Button, cx, inputClass } from '../components/ui'

export default function Login() {
  const { login, signIn } = useApp()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const goHome = (role: Role) => navigate(role === 'cliente' ? '/mi' : '/')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    const result = await login(username, password)
    setBusy(false)
    if (!result.ok || !result.userId || !result.roles?.length) {
      setError(result.error ?? 'No se pudo iniciar sesión.')
      return
    }
    // Sin selector: la sesión arranca con el rol principal de la cuenta.
    const role = result.roles[0]
    await signIn(result.userId, role)
    goHome(role)
  }

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[42%_58%]">
      {/* Panel de marca */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#2a1417] p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#d53741]/25 blur-2xl" />
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-[#f4a6ad]/15 blur-3xl" />
        <div className="absolute left-1/3 top-2/5 h-56 w-56 rounded-full bg-[#d53741]/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Activity size={20} strokeWidth={2.4} />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">Entrenamiento</p>
            <p className="text-[10.5px] uppercase tracking-[0.2em] text-white/50">Gestión de clientes</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <div className="h-1 w-12 rounded-full bg-[#f4a6ad]" />
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f4a6ad]/80">
            Acceso del equipo
          </p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.08] tracking-tight">
            Tu consulta de entrenamiento,{' '}
            <span className="text-[#f4a6ad]">en orden.</span>
          </h1>
          <p className="mt-4 text-[14.5px] leading-relaxed text-white/70">
            Clientes, mensualidades, rutinas, planes y antropometría en un solo lugar.
          </p>
          <ul className="mt-8 space-y-3.5">
            {[
              'Clientes, rutinas y planes en un solo lugar',
              'Pagos por transferencia SPEI, sin comisiones',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-[13.5px] text-white/85">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#f4a6ad]/15 ring-1 ring-[#f4a6ad]/40">
                  <CheckCircle2 size={12} className="text-[#f4a6ad]" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-1.5 text-[11.5px] text-white/45">
          <ShieldCheck size={13} className="text-[#f4a6ad]/70" /> Sesión protegida.
        </p>
      </aside>

      {/* Formulario */}
      <main className="flex min-h-dvh flex-col px-5 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white">
              <Activity size={20} strokeWidth={2.4} />
            </span>
            <div>
              <p className="text-lg font-semibold">Entrenamiento</p>
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-muted">Gestión de clientes</p>
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Acceso</p>
          <h2 className="mt-2 text-[26px] font-semibold tracking-tight sm:text-[30px]">
            Inicia sesión
          </h2>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-[12px] font-medium text-ink">
                Nombre o usuario
              </label>
              <input
                id="username"
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu nombre completo o usuario"
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-ink">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={cx(inputClass, 'pr-11')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>
            )}

            <Button type="submit" className="w-full justify-center" size="md">
              <LogIn size={16} /> Entrar
            </Button>
          </form>

          <p className="mt-6 text-center text-[12px] text-muted">
            ¿Perdiste tu contraseña? Tu administrador la restablece.{' '}
            <Link to="/servicios" className="font-medium text-brand hover:underline">
              Ver servicios
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
