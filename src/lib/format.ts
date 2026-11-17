import type { Client, ClientStatus } from '../types'

export const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)

export const fmtDate = (iso: string) => {
  if (!iso) return '—'
  // Acepta fecha (YYYY-MM-DD) y timestamp ISO completo (con hora): solo
  // la parte de la fecha es relevante. Antes un timestamp completo
  // producía «Invalid Date» en el portal.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const fmtDateShort = (iso: string) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const addDays = (base: string, days: number) => {
  const [y, m, d] = base.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const daysBetween = (from: string, to: string) => {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  const a = new Date(y1, m1 - 1, d1).getTime()
  const b = new Date(y2, m2 - 1, d2).getTime()
  return Math.round((b - a) / 86400000)
}

export const daysLeft = (endDate: string) => daysBetween(todayISO(), endDate)

export const clientStatus = (c: Client): ClientStatus => {
  if (c.paused) return 'pausado'
  const left = daysLeft(c.endDate)
  if (left < 0) return 'vencido'
  if (left <= 7) return 'por_vencer'
  return 'activo'
}

export const STATUS_META: Record<ClientStatus, { label: string; className: string; dot: string }> = {
  activo: { label: 'Activo', className: 'bg-brand-soft text-brand-dark', dot: 'bg-brand' },
  por_vencer: { label: 'Por vencer', className: 'bg-warn-soft text-warn', dot: 'bg-amber-500' },
  vencido: { label: 'Vencido', className: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  pausado: { label: 'Pausado', className: 'bg-sand text-muted', dot: 'bg-stone-400' },
}

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
]

export const avatarColor = (id: string) => {
  const n = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

/** Normaliza un nombre de ejercicio: minúsculas, sin acentos y un solo espacio. */
export const normalizeName = (value: string) =>
  value.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ')

export const relative = (isoDateTime: string) => {
  const d = new Date(isoDateTime)
  const diff = Date.now() - d.getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const days = Math.round(h / 24)
  return `hace ${days} d`
}
