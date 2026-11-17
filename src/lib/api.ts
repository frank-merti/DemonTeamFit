import type { AnthroRecord, AuditEntry, Client, ExerciseCatalogItem, ExerciseFeedback, ExerciseFeeling, ExerciseLog, MealPlan, ModuleCode, Payment, Role, Routine, RoutineCheckin, Settings, UserAccount } from '../types'

const BASE = '/api'

export class ApiError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code = 'error') {
    super(message)
    this.status = status
    this.code = code
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  if (!response.ok) {
    const payload = (data ?? {}) as { error?: string; code?: string }
    throw new ApiError(payload.error ?? 'No se pudo completar la operación.', response.status, payload.code)
  }
  return data as T
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  return parseResponse<T>(response)
}

/* ------------------------------ Criptografía ------------------------------ */

const encoder = new TextEncoder()

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

export const newSalt = () => toBase64(crypto.getRandomValues(new Uint8Array(16)))

/**
 * La contraseña no viaja al servidor: el navegador deriva una prueba PBKDF2 y
 * solo envía el resultado. La sal y las iteraciones las dicta la cuenta.
 */
export async function deriveProof(password: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

async function saltFor(username: string) {
  return request<{ salt: string; iterations: number }>(
    `/auth/salt?username=${encodeURIComponent(username)}`,
  )
}

export async function proofFor(username: string, password: string) {
  const { salt, iterations } = await saltFor(username)
  return deriveProof(password, salt, iterations)
}

/* --------------------------------- Acceso --------------------------------- */

export interface ApiUser {
  id: string
  name: string
  username: string
  role: Role
  roles: Role[]
  clientId: string | null
}

export interface LoginResponse {
  user: ApiUser
  requiresRole: boolean
}

export async function apiLogin(username: string, password: string, role?: Role) {
  const proof = await proofFor(username, password)
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { username, proof, ...(role ? { role } : {}) },
  })
}

export function apiSession() {
  return request<{ user: ApiUser; modules: ModuleCode[] }>('/auth/session')
}

export function apiSwitchRole(role: Role) {
  return request<{ ok: true; role: Role; modules: ModuleCode[] }>('/auth/role', {
    method: 'POST',
    body: { role },
  })
}

export function apiLogout() {
  return request<{ ok: true }>('/auth/logout', { method: 'POST' })
}

export async function apiChangePassword(username: string, currentPassword: string, newPassword: string) {
  const [currentProof, salt] = await Promise.all([
    proofFor(username, currentPassword),
    Promise.resolve(newSalt()),
  ])
  const newProof = await deriveProof(newPassword, salt, 210_000)
  await request<{ ok: true }>('/auth/password', {
    method: 'POST',
    body: { currentProof, newProof, newSalt: salt, newPassword },
  })
}

/* --------------------------------- Clientes -------------------------------- */

export function apiClients() {
  return request<{ clients: Client[] }>('/clients')
}

export type CreateClientInput = Partial<Client> & { username?: string; password?: string }

export function apiCreateClient(input: CreateClientInput) {
  return request<{ client: Client; credentials: { username: string; password: string } | null }>('/clients', {
    method: 'POST',
    body: input,
  })
}

export function apiUpdateClient(
  id: string,
  patch: Partial<Omit<Client, 'routineId' | 'mealPlanId'>> & { routineId?: string | null; mealPlanId?: string | null },
) {
  return request<{ client: Client }>(`/clients/${id}`, { method: 'PATCH', body: patch })
}

export function apiArchiveClient(id: string) {
  return request<{ ok: true; archived: boolean }>(`/clients/${id}/archive`, { method: 'POST' })
}

export function apiRestoreClient(id: string) {
  return request<{ ok: true; archived: boolean }>(`/clients/${id}/restore`, { method: 'POST' })
}

export function apiResetClientPassword(id: string) {
  return request<{ username: string; password: string }>(`/clients/${id}/credentials/reset`, { method: 'POST' })
}

/** Sube el plan de alimentación del cliente en PDF (máximo 5 MB). */
export async function apiUploadMealPdf(clientId: string, file: File) {
  const form = new FormData()
  form.append('file', file, file.name)
  const response = await fetch(`${BASE}/clients/${encodeURIComponent(clientId)}/meal-pdf`, {
    method: 'PUT',
    credentials: 'include',
    body: form,
  })
  return parseResponse<{ client: Client }>(response)
}

/** Quita el plan en PDF del cliente. */
export function apiRemoveMealPdf(clientId: string) {
  return request<{ client: Client }>(`/clients/${encodeURIComponent(clientId)}/meal-pdf`, { method: 'DELETE' })
}

/** URL same-origin del PDF del plan; envía la cookie de sesión. */
export const mealPdfUrl = (key?: string | null) => (key ? `${BASE}/media/${key}` : '')

/* ---------------------------------- Pagos ---------------------------------- */

export function apiPayments() {
  return request<{ payments: Payment[] }>('/payments')
}

export function apiRegisterPayment(input: {
  clientId: string
  amount: number
  /** Opcional: la API genera una referencia interna si falta. */
  reference?: string
  date: string
  days: number
}) {
  return request<{ payment: Payment }>('/payments', { method: 'POST', body: input })
}

export function apiApprovePayment(id: string) {
  return request<{
    payment: Payment
    alreadyApproved: boolean
    membership: { fromDate?: string; toDate?: string; endDate: string }
  }>(`/payments/${id}/approve`, { method: 'POST' })
}

export function apiRejectPayment(id: string) {
  return request<{ payment: Payment }>(`/payments/${id}/reject`, { method: 'POST' })
}

export function apiDeletePayment(id: string) {
  return request<{ ok: true; client: { id: string; endDate: string } }>(`/payments/${id}`, { method: 'DELETE' })
}

/* --------------------------- Rutinas y planes ------------------------------ */

export function apiRoutines() {
  return request<{ routines: Routine[] }>('/routines')
}

export function apiSaveRoutine(routine: Routine) {
  return request<{ routine: Routine }>(`/routines/${encodeURIComponent(routine.id)}`, {
    method: 'PUT',
    body: routine,
  })
}

/** Crea una copia de la plantilla para un cliente sin alterar la original. */
export function apiCustomizeRoutine(routineId: string, clientId: string) {
  return request<{ routine: Routine }>(`/routines/${encodeURIComponent(routineId)}/customize`, {
    method: 'POST',
    body: { clientId },
  })
}

/** Elimina la rutina con sus días, ejercicios, fotos y seguimiento asociado. */
export function apiDeleteRoutine(id: string) {
  return request<{ ok: true; name: string; days: number; unassigned: number }>(
    `/routines/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

/** Sube una imagen ya comprimida para un ejercicio de rutina. */
export async function apiUploadExerciseImage(file: File) {
  const form = new FormData()
  form.append('file', file, file.name)
  const response = await fetch(`${BASE}/media`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  return parseResponse<{ key: string; url: string }>(response)
}

/** URL same-origin que envía la cookie de sesión al pedir la imagen. */
export const exerciseImageUrl = (key?: string | null) =>
  key ? `${BASE}/media/${key}` : ''

/* -------------------- Biblioteca y seguimiento de ejercicios -------------------- */

export function apiExercises(clientId?: string, includeArchived = false) {
  const params = new URLSearchParams()
  if (clientId) params.set('clientId', clientId)
  if (includeArchived) params.set('includeArchived', '1')
  const query = params.toString() ? `?${params.toString()}` : ''
  return request<{ exercises: ExerciseCatalogItem[] }>(`/exercises${query}`)
}

export function apiCreateExercise(input: {
  name: string
  muscleGroup?: string
  equipment?: string
  instructions?: string
}) {
  return request<{ exercise: ExerciseCatalogItem }>('/exercises', { method: 'POST', body: input })
}

export function apiUpdateExercise(id: string, patch: Partial<Omit<ExerciseCatalogItem, 'id'>>) {
  return request<{ exercise: ExerciseCatalogItem }>(`/exercises/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
  })
}

export function apiArchiveExercise(id: string) {
  return request<{ ok: true; archived: boolean }>(`/exercises/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function apiRestoreExercise(id: string) {
  return request<{ ok: true; archived: boolean }>(`/exercises/${encodeURIComponent(id)}/restore`, { method: 'POST' })
}

export function apiRecommendExercise(exerciseId: string, clientId: string, recommended: boolean) {
  return request<{ ok: true; recommended: boolean }>(`/exercises/${encodeURIComponent(exerciseId)}/recommend`, {
    method: 'POST',
    body: { clientId, recommended },
  })
}

export function apiMyExerciseLogs() {
  return request<{ logs: ExerciseLog[] }>('/training/me/logs')
}

export function apiCreateExerciseLog(input: {
  routineId: string
  exerciseName: string
  catalogId?: string | null
  date?: string
  notes?: string
  sets: Array<{ weight: number | null; reps: number; restSeconds?: number | null }>
}) {
  return request<{ log: ExerciseLog }>('/training/me/logs', { method: 'POST', body: input })
}

export function apiClientExerciseLogs(clientId: string, routineId?: string) {
  const query = routineId ? `?routineId=${encodeURIComponent(routineId)}` : ''
  return request<{ logs: ExerciseLog[] }>(`/training/clients/${encodeURIComponent(clientId)}/logs${query}`)
}

export function apiMyFeedback() {
  return request<{ feedback: ExerciseFeedback[] }>('/training/me/feedback')
}

export function apiSetFeedback(routineId: string, exerciseName: string, value: ExerciseFeeling | null) {
  return request<{ ok?: true; feedback: ExerciseFeedback | null }>('/training/me/feedback', {
    method: 'PUT',
    body: { routineId, exerciseName, value },
  })
}

export function apiClientFeedback(clientId: string) {
  return request<{ feedback: ExerciseFeedback[] }>(`/training/clients/${encodeURIComponent(clientId)}/feedback`)
}

export function apiMyCheckins() {
  return request<{ checkins: RoutineCheckin[] }>('/training/me/checkins')
}

export function apiCreateCheckin(input: { routineId: string; date?: string; intensity: number; notes?: string }) {
  return request<{ checkin: RoutineCheckin }>('/training/me/checkins', { method: 'POST', body: input })
}

export function apiClientCheckins(clientId: string) {
  return request<{ checkins: RoutineCheckin[] }>(`/training/clients/${encodeURIComponent(clientId)}/checkins`)
}

export function apiMealPlans() {
  return request<{ mealPlans: MealPlan[] }>('/mealplans')
}

export function apiSaveMealPlan(plan: MealPlan) {
  return request<{ mealPlan: MealPlan }>(`/mealplans/${encodeURIComponent(plan.id)}`, {
    method: 'PUT',
    body: plan,
  })
}

/** Elimina el plan; los clientes asignados vuelven a «sin plan» (el PDF no se toca). */
export function apiDeleteMealPlan(planId: string) {
  return request<{ ok: true; name: string; unassigned: number }>(
    `/mealplans/${encodeURIComponent(planId)}`,
    { method: 'DELETE' },
  )
}

/* ------------------------------ Antropometría ------------------------------ */

export function apiAnthro(clientId?: string) {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''
  return request<{ records: AnthroRecord[] }>(`/anthro${query}`)
}

export function apiAddAnthro(record: Omit<AnthroRecord, 'id' | 'createdBy' | 'source'>) {
  return request<{ record: AnthroRecord }>('/anthro', { method: 'POST', body: record })
}

/* ---------------------------------- Cuenta --------------------------------- */

export function apiUpdateName(name: string) {
  return request<{ user: ApiUser }>('/me', { method: 'PATCH', body: { name } })
}

export function apiMyCredentials() {
  return request<{ username: string; password: string }>('/me/credentials')
}

export function apiMyClient() {
  return request<{ client: Client }>('/me/client')
}

/* --------------------------------- Usuarios -------------------------------- */

export function apiUsers() {
  return request<{ users: UserAccount[] }>('/users')
}

export async function apiCreateStaff(input: {
  name: string
  username: string
  email: string
  phone: string
  role: Role
  password: string
}) {
  const salt = newSalt()
  const proof = await deriveProof(input.password, salt, 210_000)
  const { password: _password, ...profile } = input
  void _password
  return request<{ user: UserAccount }>('/users', {
    method: 'POST',
    body: { ...profile, salt, proof },
  })
}

export function apiToggleUser(id: string) {
  return request<{ ok: true; active: boolean }>(`/users/${id}/toggle`, { method: 'POST' })
}

/** Restablece la contraseña de un coach desde Usuarios. */
export async function apiResetStaffPassword(id: string, password: string) {
  const salt = newSalt()
  const proof = await deriveProof(password, salt, 210_000)
  return request<{ ok: true }>(`/users/${id}/password`, {
    method: 'POST',
    body: { salt, proof },
  })
}

/** El administrador consulta la contraseña vigente de una cuenta (auditado). */
export function apiViewUserPassword(id: string) {
  return request<{ username: string; password: string }>(`/users/${encodeURIComponent(id)}/password`)
}

/* ----------------------------- Ajustes y sistema --------------------------- */

export function apiSettings() {
  return request<{ settings: Partial<Settings> }>('/settings')
}

export function apiSaveSettings(patch: Partial<Settings>) {
  return request<{ settings: Settings }>('/settings', { method: 'PATCH', body: patch })
}

export function apiAudit(limit = 200) {
  return request<{ entries: AuditEntry[] }>(`/audit?limit=${limit}`)
}

export function apiVerifyAudit() {
  return request<{ ok: boolean; checked: number; brokenAt: string | null }>('/audit/verify')
}

export function apiRunBackup() {
  return request<{ backup: { key: string; size: number; date: string } }>('/system/backup', { method: 'POST' })
}

export function apiBackups() {
  return request<{ backups: Array<{ key: string; size: number; uploaded: string; date: string }> }>('/system/backups')
}

export function apiSystemSummary() {
  return request<{
    summary: { activeClients: number; totalClients: number; payments: number; users: number }
  }>('/system/summary')
}

export async function apiDownloadBackup(key?: string) {
  const response = await fetch(`${BASE}/system/backup${key ? `?key=${encodeURIComponent(key)}` : ''}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    let payload: { error?: string; code?: string } = {}
    try {
      payload = (await response.json()) as { error?: string; code?: string }
    } catch {
      payload = {}
    }
    throw new ApiError(payload.error ?? 'No se pudo descargar el respaldo.', response.status, payload.code)
  }
  return response.blob()
}
