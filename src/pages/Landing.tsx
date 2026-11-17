import { useEffect, useState } from 'react'
import { Activity, Camera, Check, Dumbbell, FileText, Flame, LogIn, MessageCircle, NotebookPen, Ruler, Smartphone, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppStore'
import ThemeToggle from '../components/ThemeToggle'

/** Número del coach para contacto directo por WhatsApp (demo). */
const COACH_WA = 'https://wa.me/525500000000?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20los%20planes'

/** Instagram del coach (demo). */
const COACH_IG = 'https://www.instagram.com/demonteamfit'

/** Precio del plan VIP. Debe ser ≥ $2,000 para habilitar la medición completa. */
const PREMIUM_PRICE = 2000

const SERVICES = [
  {
    icon: NotebookPen,
    title: 'Rutina a tu medida',
    text: 'Días, ejercicios, series y fotos de técnica. Tu coach la escribe para ti y la ajusta semana a semana.',
  },
  {
    icon: FileText,
    title: 'Plan de alimentación en PDF',
    text: 'Tu nutrición dentro del portal, en un documento que abres igual en la cocina que en el súper.',
  },
  {
    icon: Ruler,
    title: 'Antropometría',
    text: 'Peso, grasa, cintura y cadera en cada visita. Con VIP se suma la medición completa: circunferencias, pliegues y diámetros.',
  },
  {
    icon: Smartphone,
    title: 'Portal «Tu plan diario»',
    text: 'Del celular a la laptop: abres y ves solo lo tuyo — la rutina de hoy, tu plan y tus pagos.',
  },
  {
    icon: Dumbbell,
    title: 'Bitácora de cargas',
    text: 'Anotas kilos y repeticiones por serie, el descanso se cronometra y registras qué tan dura quedó la sesión.',
  },
  {
    icon: Wallet,
    title: 'Pagos por transferencia',
    text: 'SPEI sin comisiones ni apps intermedias. El coach aprueba tu pago y tu membresía sigue corriendo.',
  },
]

const BASIC_FEATURES = [
  'Rutina de entrenamiento con fotos por ejercicio o plan de alimentación en PDF — uno de los dos por mes',
  'Antropometría básica: peso, grasa, cintura y cadera',
  'Portal «Tu plan diario» en celular y laptop',
  'Bitácora de cargas e intensidad del día',
]

const PREMIUM_FEATURES = [
  'Todo lo del plan Básico',
  'Medición completa: circunferencias, pliegues cutáneos y diámetros óseos',
  'Perfil de pérdida: fraccionamiento corporal en 4 componentes y somatotipo',
  'Gráficas de progreso con el historial extendido',
  'Atención prioritaria por WhatsApp',
]

/** La sesión de hoy que muestra la tarjeta del hero (es el producto, no decoración). */
const SESSION = [
  { ex: 'Press de banca', sets: '4×8', load: '80.0 kg', done: 3, total: 4 },
  { ex: 'Press militar sentado', sets: '3×10', load: '40.0 kg', done: 2, total: 3 },
  { ex: 'Extensión de tríceps en polea', sets: '3×12', load: '25.0 kg', done: 3, total: 3 },
  { ex: 'Plancha', sets: '3×45 s', load: '', done: 0, total: 3 },
]

const MEASUREMENTS = [
  ['Peso', '78.4', 'kg'],
  ['Grasa', '17.8', '%'],
  ['Cintura', '84.0', 'cm'],
  ['Cadera', '98.5', 'cm'],
  ['Estatura', '172', 'cm'],
]

/** Descanso que corre de verdad en el hero: el único elemento animado de la página. */
function useRestTimer() {
  const [rest, setRest] = useState(47)
  const [reduceMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (reduceMotion) return
    const id = window.setInterval(() => setRest((s) => (s === 0 ? 60 : s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [reduceMotion])
  return { rest, reduceMotion }
}

export default function Landing() {
  const navigate = useNavigate()
  const { viewRole } = useApp()
  const { rest, reduceMotion } = useRestTimer()
  const loginLabel = viewRole === 'cliente' ? 'Ir a mi portal' : viewRole ? 'Ir a mi panel' : 'Iniciar sesión'
  const loginTarget = viewRole === 'cliente' ? '/mi' : viewRole ? '/' : '/login'

  const goLogin = () => navigate(loginTarget)

  /**
   * La app rutea por hash (`/#/...`), así que un ancla `href="#planes"`
   * choca con el router. El scroll a la sección se hace con JS.
   */
  const scrollToPlans = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="landing-root min-h-dvh bg-canvas text-ink">
      {/* Barra superior */}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white">
              <Activity size={18} strokeWidth={2.4} />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-tight">Entrenamiento</p>
              <p className="text-[10px] text-muted">Gestión de clientes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href={COACH_IG}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[12px] font-medium text-muted hover:border-brand/40 hover:text-brand sm:inline-flex"
              aria-label="Instagram del coach"
            >
              <Camera size={14} /> Instagram
            </a>
            <a
              href={COACH_WA}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[12px] font-medium text-muted hover:border-brand/40 hover:text-brand sm:inline-flex"
            >
              <MessageCircle size={14} /> WhatsApp
            </a>
            <button
              onClick={goLogin}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-brand-dark"
              aria-label={loginLabel}
            >
              <LogIn size={14} /> {loginLabel}
            </button>
          </div>
        </div>
      </header>

      {/* Hero: el titular y la sesión de hoy, viva */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:pb-24 lg:pt-20">
          <div>
            <p className="rise mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand [animation-delay:40ms]">
              <Flame size={12} /> Entrenamiento con coach real
            </p>
            <h1 className="rise landing-display text-[38px] leading-[1.02] text-ink sm:text-[54px]">
              Tu coach{' '}
              <span className="rounded-2xl bg-brand-soft px-2 text-brand">ya diseñó</span> tu
              entrenamiento de hoy. Tú{' '}
              <span className="text-brand underline decoration-brand/40 decoration-[5px] underline-offset-[10px] sm:decoration-[7px]">
                solo entrena.
              </span>
            </h1>
            <p className="rise mt-6 max-w-md text-[15.5px] leading-relaxed text-muted [animation-delay:90ms] sm:text-[16.5px]">
              Tu rutina del día, tu plan de alimentación y tu antropometría, en un portal que solo
              muestra lo tuyo. ¿Cuántas series perdiste buscando tu rutina en el chat? Tu coach está
              a un click de distancia — le escribes y te responde él, no un bot.
            </p>
            <div className="rise mt-8 flex flex-wrap gap-3 [animation-delay:170ms]">
              <a
                href="#planes"
                onClick={scrollToPlans}
                className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-[13.5px] font-semibold text-canvas transition-colors hover:bg-brand hover:text-white"
              >
                Ver los planes
              </a>
              <a
                href={COACH_WA}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 text-[13.5px] font-semibold text-ink transition-colors hover:border-brand/40 hover:text-brand"
              >
                <MessageCircle size={16} /> Hablar con el coach
              </a>
            </div>
            <p className="rise mt-6 text-[12px] text-muted [animation-delay:230ms]">
              Nuevo aquí: tu primera semana la armamos contigo, y tu acceso al portal llega el mismo día.
            </p>
          </div>

          {/* Tarjeta HOY: la hoja de la sesión, como en el portal real */}
          <div className="rise [animation-delay:120ms]">
            <div className="mx-auto max-w-sm -rotate-1 rounded-2xl border border-line bg-surface shadow-xl shadow-ink/5 lg:mx-0 lg:ml-auto">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                  <span className="rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">HOY</span>
                  Martes 11 de noviembre
                </p>
                <span className="text-[10.5px] text-muted">Demo</span>
              </div>

              <div className="px-5 pt-4">
                <p className="text-[11px] font-semibold text-muted">Fuerza — Empuje · Día 2</p>
              </div>

              <ul className="px-5 pb-1 pt-2.5">
                {SESSION.map((row) => {
                  const complete = row.done === row.total
                  return (
                    <li key={row.ex} className="flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0">
                      <span
                        className={
                          complete
                            ? 'grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-white'
                            : 'grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[10px] font-semibold text-muted'
                        }
                      >
                        {complete ? <Check size={12} strokeWidth={3} /> : `${row.done}`}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-[13px] ${complete ? 'text-muted line-through decoration-line' : 'text-ink'}`}>
                        {row.ex}
                      </span>
                      <span className="shrink-0 text-right text-[12.5px] tabular-nums">
                        <span className="font-semibold text-ink">{row.sets}</span>
                        {row.load && <span className="ml-1.5 text-muted">{row.load}</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>

              {/* Descanso corriendo: el momento único de la página */}
              <div className="mx-5 mb-4 rounded-xl bg-sand px-4 py-3">
                <div className="flex items-center justify-between text-[12px]">
                  <p className="font-medium text-ink">Descanso</p>
                  <p className="tabular-nums font-semibold text-ink">
                    {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-linear"
                    style={{ width: reduceMotion ? '50%' : `${(rest / 60) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-line px-5 py-3">
                <p className="text-[11.5px] text-muted">Intensidad de hoy</p>
                <p className="text-[12px] font-semibold text-brand tabular-nums">8 / 10</p>
              </div>
            </div>
            <p className="mt-3 text-center text-[11.5px] text-muted lg:text-right">
              Así se ve tu rutina en el portal, desde el celular.
            </p>
          </div>
        </div>
      </section>

      {/* Servicios: lista índice con reglas, sin tarjetas clónicas */}
      <section id="servicios" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div>
              <h2 className="landing-display max-w-sm text-[30px] leading-[1.05] text-ink sm:text-[38px]">
                Lo que recibes cada semana
              </h2>
              <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-muted">
                Nada de plantillas recicladas: cada pieza sale de tu expediente y de tus avances.
              </p>
            </div>
            <ul>
              {SERVICES.map((service) => (
                <li key={service.title} className="grid gap-1.5 border-b border-line py-5 first:pt-0 sm:grid-cols-[210px_1fr] sm:gap-6">
                  <p className="flex items-start gap-2.5 text-[14.5px] font-semibold text-ink">
                    <service.icon size={17} className="mt-0.5 shrink-0 text-brand" /> {service.title}
                  </p>
                  <p className="text-[13px] leading-relaxed text-muted">{service.text}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Tira antropométrica: lo que se mide, queda registrado */}
          <div className="mt-12 rounded-2xl border border-line bg-canvas px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-semibold text-ink">Lo que se mide, queda registrado</p>
              <p className="text-[11.5px] text-muted">Medición del 4 de noviembre</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-5">
              {MEASUREMENTS.map(([label, value, unit]) => (
                <div key={label} className="border-l border-line pl-4 first:border-0 first:pl-0 sm:first:border-l sm:first:pl-4 sm:[&:nth-child(1)]:border-l-0 sm:[&:nth-child(1)]:pl-0">
                  <p className="text-[11px] text-muted">{label}</p>
                  <p className="mt-0.5 text-[19px] font-semibold tabular-nums text-ink">
                    {value} <span className="text-[11px] font-normal text-muted">{unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Planes: asimétricos, el VIP con más peso */}
      <section id="planes" className="scroll-mt-14 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <div className="max-w-xl">
            <h2 className="landing-display text-[30px] leading-[1.05] text-ink sm:text-[38px]">
              Dos planes, ningún intermediario
            </h2>
            <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
              Pagas tu mensualidad por transferencia y tu coach la aprueba al instante. Sin comisiones
              ni plataformas de por medio.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-12">
            {/* VIP: la ficha fuerte */}
            <div className="flex flex-col rounded-3xl bg-[#2a1417] p-7 text-white lg:col-span-7 lg:p-9">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="landing-display text-[26px] text-white sm:text-[30px]">VIP</h3>
                <span className="rounded-full bg-brand px-2.5 py-1 text-[10.5px] font-semibold">Medición completa + análisis</span>
              </div>
              <p className="mt-1.5 text-[13px] text-white/60">
                Seguimiento completo del cuerpo y del entrenamiento, sin dejar nada fuera.
              </p>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="landing-display text-[44px] leading-none text-white sm:text-[56px] tabular-nums">
                  ${PREMIUM_PRICE.toLocaleString('es-MX')}
                </span>
                <span className="text-[13px] text-white/60">por mes</span>
              </p>
              <ul className="mt-7 flex-1 space-y-3">
                {PREMIUM_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-[13px] leading-snug text-white/85">
                    <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-[#f4a6ad]" /> {feature}
                  </li>
                ))}
              </ul>
              <a
                href={COACH_WA}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                <MessageCircle size={15} /> Empezar con VIP
              </a>
              <p className="mt-3 text-[11px] text-white/40">
                La medición completa y el perfil de pérdida se habilitan con este plan.
              </p>
            </div>

            {/* Básico: la ficha de papel */}
            <div className="flex flex-col rounded-3xl border border-line bg-surface p-7 lg:col-span-5 lg:p-9">
              <h3 className="landing-display text-[26px] text-ink sm:text-[30px]">Básico</h3>
              <p className="mt-1.5 text-[13px] text-muted">
                Todo lo esencial para entrenar con orden desde el primer día.
              </p>
              <p className="mt-5 text-[15px] text-muted">
                Precio <span className="font-semibold text-ink">cotizado contigo</span> — depende de cuántos
                días a la semana entrenes.
              </p>
              <ul className="mt-7 flex-1 space-y-3">
                {BASIC_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-[13px] leading-snug text-ink/90">
                    <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-brand" /> {feature}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-line pt-4 text-[11.5px] leading-relaxed text-muted">
                Un plan a la vez: eliges <span className="font-semibold text-ink">rutina de entrenamiento</span>{' '}
                <em>o</em>{' '}
                <span className="font-semibold text-ink">plan de alimentación</span> — nunca los dos en el
                mismo mes. Tu coach te ayuda a decidir el que más te conviene.
              </p>
              <a
                href={COACH_WA}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl border border-brand/40 px-4 py-3.5 text-[13.5px] font-semibold text-brand transition-colors hover:bg-brand-soft"
              >
                <MessageCircle size={15} /> Cotizar el Básico
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Contacto: banda granate */}
      <section id="contacto" className="bg-[#2a1417] text-white">
        <div className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-6 lg:py-16">
          <h2 className="landing-display text-[25px] leading-[1.1] sm:text-[33px]">
            ¿Listo para tu primera mensualidad?
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-white/65">
            Escríbele al coach, aparta tu lugar y recibe tu acceso al portal el mismo día.
          </p>
        </div>
      </section>

      {/* Pie */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-6 sm:px-6">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white">
            <Activity size={14} />
          </span>
          <p className="text-[12px] text-muted">© 2026 Entrenamiento — versión de prueba</p>
        </div>
      </footer>
    </div>
  )
}
