import React from 'react'
import { Check, Copy, X, ChevronRight, Inbox } from 'lucide-react'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------- Copiar dato ------------------------------- */

export function CopyButton({
  value,
  label,
  className,
  withText = false,
}: {
  value: string
  label: string
  className?: string
  withText?: boolean
}) {
  const [copied, setCopied] = React.useState(false)

  const copy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Sin permiso de portapapeles: se deja el valor visible para copiar a mano.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copiar ${label}`}
      title={copied ? 'Copiado' : `Copiar ${label}`}
      className={cx(
        'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line text-muted transition-colors hover:text-ink',
        withText ? 'px-2.5' : 'w-8',
        copied && 'border-brand/40 bg-brand-soft text-brand',
        className,
      )}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {withText && <span className="text-[11px] font-medium">{copied ? 'Copiado' : 'Copiar'}</span>}
    </button>
  )
}

/* ---------------------------------- Button --------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm shadow-brand/20',
    secondary: 'bg-surface text-ink border border-line hover:bg-canvas',
    ghost: 'text-muted hover:text-ink hover:bg-sand/60',
    danger: 'bg-danger text-canvas hover:bg-danger/85',
    soft: 'bg-brand-soft text-brand-dark hover:bg-emerald-100',
  }
  const sizes = {
    sm: 'h-9 px-3 text-sm gap-1.5',
    md: 'h-11 px-4 text-sm gap-2',
    lg: 'h-12 px-5 text-base gap-2',
  }
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}

/* ----------------------------------- Card ---------------------------------- */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-surface', className)}>{children}</div>
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="min-w-0">
        <h3 className="font-semibold text-[15px] leading-tight text-ink">{title}</h3>
        {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/* ---------------------------------- Badge ---------------------------------- */

type BadgeTone = 'brand' | 'warn' | 'danger' | 'neutral' | 'info'

export function Badge({
  children,
  tone = 'neutral',
  dot,
  className,
}: {
  children: React.ReactNode
  tone?: BadgeTone
  dot?: string
  className?: string
}) {
  const tones: Record<BadgeTone, string> = {
    brand: 'bg-brand-soft text-brand-dark',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
    neutral: 'bg-sand text-muted',
    info: 'bg-info-soft text-info',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium leading-none whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />}
      {children}
    </span>
  )
}

/* ---------------------------------- Avatar --------------------------------- */

export function Avatar({
  name,
  color,
  size = 'md',
}: {
  name: string
  color: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizes = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-base' }
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide',
        sizes[size],
        color,
      )}
    >
      {initials}
    </span>
  )
}

/* -------------------------------- Progress --------------------------------- */

export function Progress({
  value,
  tone = 'brand',
  className,
}: {
  value: number
  tone?: 'brand' | 'good' | 'warn' | 'danger'
  className?: string
}) {
  const tones = { brand: 'bg-brand', good: 'bg-emerald-600 dark:bg-emerald-400', warn: 'bg-amber-500', danger: 'bg-danger' }
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-sand', className)}>
      <div
        className={cx('h-full rounded-full transition-all', tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

/* ---------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-sand hover:text-ink"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-line bg-canvas/50 px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------------------------------- Field ---------------------------------- */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15'

/** Select compacto con ancho nativo (auto): sin w-full, que lo estiraba a
 * todo el ancho del contenedor (0.27.5). Combínalo con h/py/text según uso. */
export const selectCompact =
  'rounded-xl border border-line bg-surface px-3 text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15'

/* -------------------------------- EmptyState ------------------------------- */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sand text-muted">
        <Inbox size={22} />
      </span>
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* -------------------------------- PageHeader ------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</p>
        )}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------------------------------- Stat ----------------------------------- */

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  icon?: React.ReactNode
  tone?: 'neutral' | 'brand' | 'warn' | 'danger'
}) {
  const tones = {
    neutral: 'bg-sand text-ink',
    brand: 'bg-brand-soft text-brand-dark',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  }
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        {icon && <span className={cx('grid h-8 w-8 place-items-center rounded-xl', tones[tone])}>{icon}</span>}
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight">{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </Card>
  )
}

/* -------------------------------- ListRow ---------------------------------- */

export function ListRow({
  onClick,
  children,
  className,
}: {
  onClick?: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      onClick={onClick}
      className={cx(
        'flex items-center gap-3 px-4 py-3 transition-colors',
        onClick && 'cursor-pointer hover:bg-canvas/70',
        className,
      )}
    >
      {children}
      {onClick && <ChevronRight size={16} className="ml-auto shrink-0 text-muted/60" />}
    </div>
  )
}

/* ---------------------------------- Tabs ----------------------------------- */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T
  onChange: (v: T) => void
  items: Array<{ value: T; label: string; count?: number }>
}) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto p-1">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cx(
            'whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
            value === item.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {item.label}
          {typeof item.count === 'number' && (
            <span
              className={cx(
                'ml-1.5 rounded-md px-1.5 py-0.5 text-[11px]',
                value === item.value ? 'bg-brand-soft text-brand-dark' : 'bg-sand text-muted',
              )}
            >
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------- Search input ------------------------------ */

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(inputClass, 'pl-9')}
        type="search"
      />
    </div>
  )
}
