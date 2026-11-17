import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnthroRecord,
  AuditEntry,
  Client,
  MealPlan,
  ModuleCode,
  Payment,
  PaymentStatus,
  Role,
  Routine,
  Settings,
  UserAccount,
} from '../types'
import {
  seedAudit,
  seedSettings,
} from '../data/mock'
import { passwordProblem } from '../lib/password'
import {
  ApiError,
  apiAddAnthro,
  apiAnthro,
  apiArchiveClient,
  apiAudit,
  apiChangePassword,
  apiClients,
  apiCreateClient,
  apiCreateStaff,
  apiLogin,
  apiLogout,
  apiMealPlans,
  apiMyCredentials,
  apiMyClient,
  apiPayments,
  apiRegisterPayment,
  apiApprovePayment,
  apiRejectPayment,
  apiDeletePayment,
  apiResetClientPassword,
  apiRestoreClient,
  apiRoutines,
  apiCustomizeRoutine,
  apiDeleteRoutine,
  apiRunBackup,
  apiSaveMealPlan,
  apiDeleteMealPlan,
  apiSaveRoutine,
  apiSaveSettings,
  apiSession,
  apiSettings,
  apiSwitchRole,
  apiToggleUser,
  apiUpdateClient,
  apiUpdateName,
  apiUploadMealPdf,
  apiRemoveMealPdf,
  apiUsers,
  apiVerifyAudit,
  type ApiUser,
} from '../lib/api'

const STORAGE_KEY = 'entrenamiento-demo-v3'
const LEGACY_KEYS = ['entrenamiento-demo-v1', 'entrenamiento-demo-v2', 'entrenamiento-role', 'entrenamiento-session-v1']

/** Normaliza el usuario: minúsculas, sin acentos, espacios ni signos. */
export const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')

/* Solo lo que todavía vive en el navegador mientras llega la fase 2.5. */
interface PersistShape {
  audit: AuditEntry[]
  settings: Settings
}

export interface LoginResult {
  ok: boolean
  error?: string
  userId?: string
  userName?: string
  roles?: Role[]
}

interface AppContextValue extends PersistShape {
  clients: Client[]
  users: UserAccount[]
  payments: Payment[]
  routines: Routine[]
  mealPlans: MealPlan[]
  anthro: AnthroRecord[]
  viewRole: Role | null
  currentUser: UserAccount | null
  booting: boolean
  toast: Toast | null
  login: (username: string, password: string) => Promise<LoginResult>
  signIn: (userId: string, role: Role) => Promise<void>
  switchRole: (role: Role) => Promise<void>
  logout: () => void
  can: (module: ModuleCode) => boolean
  activeClients: Client[]
  notify: (message: string, tone?: 'ok' | 'warn') => void
  dismissToast: () => void
  addClient: (input: Partial<Client> & { username?: string; password?: string }) => Promise<{
    ok: boolean
    error?: string
    id?: string
    username?: string
    password?: string
  }>
  updateOwnAccount: (input: { name?: string; password?: string; currentPassword?: string }) => Promise<{ ok: boolean; error?: string }>
  loadMyPassword: () => Promise<string | null>
  resetClientPassword: (userId: string) => Promise<{ username: string; password: string } | null>
  updateClient: (id: string, patch: Partial<Client>) => Promise<void>
  archiveClient: (id: string) => Promise<void>
  restoreClient: (id: string) => Promise<void>
  addAnthro: (input: Omit<AnthroRecord, 'id' | 'createdBy' | 'source'>) => Promise<{ ok: boolean; error?: string }>
  saveRoutine: (routine: Routine) => Promise<{ ok: boolean; error?: string }>
  deleteRoutine: (routineId: string) => Promise<{ ok: boolean; error?: string }>
  assignRoutine: (routineId: string, clientId: string) => Promise<void>
  unassignRoutine: (clientId: string) => Promise<void>
  customizeRoutine: (routineId: string, clientId: string) => Promise<{ ok: boolean; error?: string; routine?: Routine }>
  saveMealPlan: (plan: MealPlan) => Promise<{ ok: boolean; error?: string }>
  /** Elimina el plan; los clientes asignados quedan «sin plan» y el PDF no se toca. */
  deleteMealPlan: (planId: string) => Promise<{ ok: boolean; error?: string }>
  assignMealPlan: (planId: string, clientId: string) => Promise<void>
  uploadMealPdf: (clientId: string, file: File) => Promise<boolean>
  removeMealPdf: (clientId: string) => Promise<boolean>
  /** Quita solo el plan estructurado; el PDF del cliente (si tiene) se conserva. */
  unassignMealPlan: (clientId: string) => Promise<boolean>
  clearFoodPlan: (clientId: string) => Promise<boolean>
  registerPayment: (input: Pick<Payment, 'clientId' | 'amount' | 'date' | 'days'> & { reference?: string }) => Promise<{ ok: boolean; error?: string }>
  reviewPayment: (id: string, status: PaymentStatus) => Promise<{ ok: boolean; error?: string; endDate?: string }>
  deletePayment: (id: string) => Promise<{ ok: boolean; error?: string; endDate?: string }>
  saveUser: (user: UserAccount) => Promise<{ ok: boolean; error?: string }>
  toggleUser: (id: string) => Promise<void>
  toggleModule: (role: Role, module: ModuleCode) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<{ ok: boolean; error?: string }>
  runBackup: () => Promise<{ ok: boolean; size?: number; error?: string }>
  verifyAudit: () => Promise<{ ok: boolean; checked: number; brokenAt?: string | null; error?: string }>
}

interface Toast {
  id: number
  message: string
  tone: 'ok' | 'warn'
}

interface SessionState {
  user: UserAccount
  role: Role
  modules: ModuleCode[]
}

const AppContext = createContext<AppContextValue | null>(null)

const initialState: PersistShape = {
  audit: seedAudit,
  settings: seedSettings,
}

const loadLocal = (): PersistShape => {
  try {
    for (const key of [...LEGACY_KEYS, STORAGE_KEY]) {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }
  } catch {
    /* almacenamiento no disponible */
  }
  return initialState
}

const toAccount = (user: ApiUser): UserAccount => ({
  id: user.id,
  username: user.username,
  name: user.name,
  email: '',
  phone: '',
  role: user.role,
  roles: user.roles,
  active: true,
  clientId: user.clientId ?? undefined,
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistShape>(loadLocal)
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<UserAccount[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([])
  const [anthro, setAnthro] = useState<AnthroRecord[]>([])
  const [session, setSession] = useState<SessionState | null>(null)
  const [booting, setBooting] = useState(true)
  const [toast, setToast] = useState<Toast | null>(null)
  const pending = useRef<{ user: ApiUser; roles: Role[] } | null>(null)

  useEffect(() => {
    loadLocal()
  }, [])

  const notify = useCallback((message: string, tone: 'ok' | 'warn' = 'ok') => {
    setToast({ id: Date.now(), message, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  const loadData = useCallback(async (role: Role) => {
    const jobs: Promise<void>[] = []
    if (role === 'coach' || role === 'admin') {
      jobs.push(
        apiClients()
          .then((data) => setClients(data.clients))
          .catch(() => setClients([])),
      )
    } else if (role === 'cliente') {
      jobs.push(
        apiMyClient()
          .then((data) => setClients([data.client]))
          .catch(() => setClients([])),
      )
    } else {
      setClients([])
    }
    if (role === 'coach' || role === 'admin' || role === 'super_admin') {
      jobs.push(
        apiUsers()
          .then((data) => setUsers(data.users))
          .catch(() => setUsers([])),
      )
    } else {
      setUsers([])
    }
    jobs.push(
      apiPayments()
        .then((data) => setPayments(data.payments))
        .catch(() => setPayments([])),
    )
    if (role === 'super_admin') {
      setRoutines([])
      setMealPlans([])
      setAnthro([])
    } else {
      jobs.push(
        apiRoutines()
          .then((data) => setRoutines(data.routines))
          .catch(() => setRoutines([])),
        apiMealPlans()
          .then((data) => setMealPlans(data.mealPlans))
          .catch(() => setMealPlans([])),
        apiAnthro()
          .then((data) => setAnthro(data.records))
          .catch(() => setAnthro([])),
      )
    }
    jobs.push(
      apiSettings()
        .then((data) => setState((s) => ({ ...s, settings: { ...s.settings, ...data.settings } })))
        .catch(() => undefined),
    )
    if (role === 'admin' || role === 'super_admin') {
      jobs.push(
        apiAudit()
          .then((data) => setState((s) => ({ ...s, audit: data.entries })))
          .catch(() => undefined),
      )
    } else {
      setState((s) => ({ ...s, audit: [] }))
    }
    await Promise.all(jobs)
  }, [])

  const applySession = useCallback(
    async (user: ApiUser, role: Role, modules: ModuleCode[]) => {
      setSession({ user: toAccount({ ...user, role }), role, modules })
      await loadData(role)
    },
    [loadData],
  )

  useEffect(() => {
    let alive = true
    apiSession()
      .then(async (data) => {
        if (!alive) return
        await applySession(data.user, data.user.role, data.modules)
      })
      .catch(() => {
        if (alive) setSession(null)
      })
      .finally(() => {
        if (alive) setBooting(false)
      })
    return () => {
      alive = false
    }
  }, [applySession])

  const currentUser = session?.user ?? null
  const viewRole = session?.role ?? null

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const handle = username.trim()
    if (!handle || !password) {
      return { ok: false, error: 'Escribe tu usuario y contraseña.' }
    }
    try {
      const data = await apiLogin(handle, password)
      pending.current = { user: data.user, roles: data.user.roles }
      return { ok: true, userId: data.user.id, userName: data.user.name, roles: data.user.roles }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof ApiError ? error.message : 'No se pudo conectar con el servidor.',
      }
    }
  }, [])

  const signIn = useCallback(
    async (_userId: string, role: Role) => {
      const data = pending.current
      if (!data) return
      try {
        if (data.roles.length > 1) {
          const switched = await apiSwitchRole(role)
          await applySession(data.user, role, switched.modules)
        } else {
          const live = await apiSession()
          await applySession(live.user, live.user.role, live.modules)
        }
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo iniciar la sesión.', 'warn')
      }
    },
    [applySession, notify],
  )

  /** Cambia de rol dentro de la sesión activa (multi-rol) sin volver a entrar. */
  const switchRole = useCallback(
    async (role: Role) => {
      try {
        await apiSwitchRole(role)
        const live = await apiSession()
        await applySession(live.user, live.user.role, live.modules)
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo cambiar el rol.', 'warn')
      }
    },
    [applySession, notify],
  )

  const logout = useCallback(() => {
    void apiLogout().catch(() => undefined)
    pending.current = null
    setSession(null)
    setClients([])
    setUsers([])
    setPayments([])
    setRoutines([])
    setMealPlans([])
    setAnthro([])
  }, [])

  const can = useCallback(
    (module: ModuleCode) => Boolean(session?.modules.includes(module)),
    [session],
  )

  const log = useCallback(
    (_action: string, _entity: string, _detail: string, _actor?: string, _actorRole?: Role) => {
      if (viewRole !== 'admin' && viewRole !== 'super_admin') return
      void apiAudit()
        .then((data) => setState((s) => ({ ...s, audit: data.entries })))
        .catch(() => undefined)
    },
    [viewRole],
  )

  const addClient = useCallback(
    async (input: Partial<Client> & { username?: string; password?: string }) => {
      try {
        const data = await apiCreateClient({
          ...input,
          coachId: input.coachId,
          price: Number(input.price ?? 2000),
        })
        const list = await apiClients()
        setClients(list.clients)
        if (viewRole === 'admin' || viewRole === 'super_admin') {
          void apiUsers().then((data) => setUsers(data.users)).catch(() => undefined)
        }
        log('client.create', data.client.id, `Alta de ${data.client.name} y su acceso`)
        return {
          ok: true,
          id: data.client.id,
          username: data.credentials?.username,
          password: data.credentials?.password,
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo guardar el cliente.',
        }
      }
    },
    [log, viewRole],
  )

  const updateClient = useCallback(
    async (id: string, patch: Partial<Client>) => {
      try {
        const data = await apiUpdateClient(id, patch)
        setClients((list) => list.map((client) => (client.id === id ? data.client : client)))
        log('client.update', id, `Actualizó ficha (${Object.keys(patch).join(', ')})`)
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo actualizar la ficha.', 'warn')
      }
    },
    [log, notify],
  )

  const archiveClient = useCallback(
    async (id: string) => {
      const client = clients.find((item) => item.id === id)
      try {
        await apiArchiveClient(id)
        setClients((list) => list.map((item) => (item.id === id ? { ...item, archived: true } : item)))
        log('client.archive', id, `Archivó a ${client?.name ?? id}`)
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo archivar.', 'warn')
      }
    },
    [clients, log, notify],
  )

  const restoreClient = useCallback(
    async (id: string) => {
      try {
        await apiRestoreClient(id)
        setClients((list) => list.map((item) => (item.id === id ? { ...item, archived: false } : item)))
        log('client.restore', id, 'Restauró cliente archivado')
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo restaurar.', 'warn')
      }
    },
    [log, notify],
  )

  const addAnthro = useCallback(
    async (input: Omit<AnthroRecord, 'id' | 'createdBy' | 'source'>) => {
      try {
        const data = await apiAddAnthro(input)
        setAnthro((list) =>
          [...list, data.record].sort((a, b) => b.date.localeCompare(a.date) || b.createdBy.localeCompare(a.createdBy)),
        )
        const fromClient = data.record.source === 'cliente'
        log(
          fromClient ? 'anthropometry.self' : 'anthropometry.create',
          input.clientId,
          `${fromClient ? 'El cliente registró' : 'Registró'} medición · ${input.weight} kg`,
        )
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo registrar la medición.',
        }
      }
    },
    [log],
  )

  const saveRoutine = useCallback(
    async (routine: Routine) => {
      try {
        const data = await apiSaveRoutine(routine)
        setRoutines((list) => {
          const exists = list.some((r) => r.id === data.routine.id)
          return exists ? list.map((r) => (r.id === data.routine.id ? data.routine : r)) : [data.routine, ...list]
        })
        log('routine.save', routine.id, `Guardó rutina "${routine.name}"`)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo guardar la rutina.',
        }
      }
    },
    [log],
  )

  const deleteRoutine = useCallback(
    async (routineId: string) => {
      const routine = routines.find((r) => r.id === routineId)
      try {
        await apiDeleteRoutine(routineId)
        setRoutines((list) => list.filter((r) => r.id !== routineId))
        setClients((list) =>
          list.map((client) => (client.routineId === routineId ? { ...client, routineId: undefined } : client)),
        )
        log('routine.delete', routineId, `Eliminó la rutina "${routine?.name ?? routineId}"`)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo eliminar la rutina.',
        }
      }
    },
    [log, routines],
  )

  const assignRoutine = useCallback(
    async (routineId: string, clientId: string) => {      const client = clients.find((c) => c.id === clientId)
      const routine = routines.find((r) => r.id === routineId)
      try {
        const data = await apiUpdateClient(clientId, { routineId })
        setClients((list) => list.map((c) => (c.id === clientId ? data.client : c)))
        setRoutines((list) =>
          list.map((r) => ({
            ...r,
            assignedTo:
              r.id === routineId
                ? Array.from(new Set([...r.assignedTo, clientId]))
                : r.assignedTo.filter((id) => id !== clientId),
          })),
        )
        log('routine.assign', routineId, `Asignó "${routine?.name}" a ${client?.name}`)
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo asignar la rutina.', 'warn')
      }
    },
    [clients, log, notify, routines],
  )

  const customizeRoutine = useCallback(
    async (routineId: string, clientId: string) => {
      const client = clients.find((c) => c.id === clientId)
      const base = routines.find((r) => r.id === routineId)
      try {
        const data = await apiCustomizeRoutine(routineId, clientId)
        setRoutines((list) => {
          const assigned = (r: Routine): Routine => ({
            ...r,
            assignedTo:
              r.id === data.routine.id
                ? [clientId]
                : r.assignedTo.filter((id) => id !== clientId),
          })
          return [assigned(data.routine), ...list.filter((r) => r.id !== data.routine.id).map(assigned)]
        })
        setClients((list) => list.map((c) => (c.id === clientId ? { ...c, routineId: data.routine.id } : c)))
        log('routine.customize', clientId, `Personalizó «${base?.name ?? 'la rutina'}» para ${client?.name ?? clientId}`)
        return { ok: true, routine: data.routine }
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'No se pudo personalizar la rutina.'
        notify(message, 'warn')
        return { ok: false, error: message }
      }
    },
    [clients, log, notify, routines],
  )

  const unassignRoutine = useCallback(
    async (clientId: string) => {
      const client = clients.find((c) => c.id === clientId)
      const routine = routines.find((r) => r.id === client?.routineId)
      try {
        const data = await apiUpdateClient(clientId, { routineId: null })
        setClients((list) => list.map((c) => (c.id === clientId ? data.client : c)))
        setRoutines((list) =>
          list.map((r) => ({ ...r, assignedTo: r.assignedTo.filter((id) => id !== clientId) })),
        )
        log('routine.unassign', clientId, `Quitó "${routine?.name ?? 'la rutina'}" a ${client?.name ?? clientId}`)
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo quitar la rutina.', 'warn')
      }
    },
    [clients, log, notify, routines],
  )

  const saveMealPlan = useCallback(
    async (plan: MealPlan) => {
      try {
        const data = await apiSaveMealPlan(plan)
        setMealPlans((list) => {
          const exists = list.some((p) => p.id === data.mealPlan.id)
          return exists ? list.map((p) => (p.id === data.mealPlan.id ? data.mealPlan : p)) : [data.mealPlan, ...list]
        })
        log('mealplan.save', plan.id, `Guardó plan "${plan.name}"`)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo guardar el plan.',
        }
      }
    },
    [log],
  )

  /** Elimina el plan de alimentación; los clientes asignados quedan «sin plan»
   * y su plan en PDF (si tienen) no se toca (0.27.9). */
  const deleteMealPlan = useCallback(
    async (planId: string) => {
      const plan = mealPlans.find((p) => p.id === planId)
      try {
        const data = await apiDeleteMealPlan(planId)
        setMealPlans((list) => list.filter((p) => p.id !== planId))
        setClients((list) =>
          list.map((c) => (c.mealPlanId === planId ? { ...c, mealPlanId: undefined } : c)),
        )
        log('mealplan.delete', planId, `Eliminó el plan "${plan?.name ?? planId}" (${data.unassigned} clientes desasignados)`)
        notify(data.unassigned > 0 ? `Plan eliminado · ${data.unassigned} cliente(s) sin plan` : 'Plan eliminado')
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo eliminar el plan.',
        }
      }
    },
    [clients, log, mealPlans, notify],
  )

  const assignMealPlan = useCallback(
    async (planId: string, clientId: string) => {
      const client = clients.find((c) => c.id === clientId)
      const plan = mealPlans.find((p) => p.id === planId)
      try {
        const data = await apiUpdateClient(clientId, { mealPlanId: planId })
        setClients((list) => list.map((c) => (c.id === clientId ? data.client : c)))
        setMealPlans((list) =>
          list.map((p) => ({
            ...p,
            assignedTo:
              p.id === planId
                ? Array.from(new Set([...p.assignedTo, clientId]))
                : p.assignedTo.filter((id) => id !== clientId),
          })),
        )
        log('mealplan.assign', planId, `Asignó "${plan?.name}" a ${client?.name}`)
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo asignar el plan.', 'warn')
      }
    },
    [clients, log, mealPlans, notify],
  )

  const uploadMealPdf = useCallback(
    async (clientId: string, file: File) => {
      const client = clients.find((c) => c.id === clientId)
      try {
        const data = await apiUploadMealPdf(clientId, file)
        setClients((list) => list.map((c) => (c.id === clientId ? data.client : c)))
        log('mealplan.pdf_upload', clientId, `Subió el plan en PDF de ${client?.name ?? clientId}`)
        notify('Plan en PDF actualizado')
        return true
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo subir el PDF.', 'warn')
        return false
      }
    },
    [clients, log, notify],
  )

  const removeMealPdf = useCallback(
    async (clientId: string) => {
      const client = clients.find((c) => c.id === clientId)
      try {
        const data = await apiRemoveMealPdf(clientId)
        setClients((list) => list.map((c) => (c.id === clientId ? data.client : c)))
        log('mealplan.pdf_delete', clientId, `Eliminó el plan en PDF de ${client?.name ?? clientId}`)
        notify('Plan en PDF eliminado')
        return true
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo eliminar el PDF.', 'warn')
        return false
      }
    },
    [clients, log, notify],
  )

  /**
   * Quita el apartado de alimentación del cliente (plan estructurado y PDF).
   * Sirve al reemplazo confirmado del plan Básico: el coach elige un solo
   * apartado, así que primero se libera el que tenía.
   */
  const clearFoodPlan = useCallback(
    async (clientId: string) => {
      const client = clients.find((c) => c.id === clientId)
      try {
        if (client?.mealPdfKey) {
          const ok = await removeMealPdf(clientId)
          if (!ok) return false
        }
        if (client?.mealPlanId) {
          const data = await apiUpdateClient(clientId, { mealPlanId: null })
          setClients((list) => list.map((c) => (c.id === clientId ? data.client : c)))
          setMealPlans((list) =>
            list.map((p) => ({ ...p, assignedTo: p.assignedTo.filter((id) => id !== clientId) })),
          )
          log('mealplan.unassign', clientId, `Quitó el plan de alimentación a ${client?.name ?? clientId}`)
        }
        return true
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo quitar el plan de alimentación.', 'warn')
        return false
      }
    },
    [clients, log, notify, removeMealPdf],
  )

  /**
   * Quita solo el plan estructurado del cliente (0.27.8). Si el cliente
   * tiene un plan en PDF, este queda intacto: el coach puede quitar el
   * plan y el cliente sigue viendo su PDF en el portal.
   */
  const unassignMealPlan = useCallback(
    async (clientId: string) => {
      const client = clients.find((c) => c.id === clientId)
      try {
        const data = await apiUpdateClient(clientId, { mealPlanId: null })
        setClients((list) => list.map((c) => (c.id === clientId ? data.client : c)))
        setMealPlans((list) =>
          list.map((p) => ({ ...p, assignedTo: p.assignedTo.filter((id) => id !== clientId) })),
        )
        log('mealplan.unassign', clientId, `Quitó el plan estructurado a ${client?.name ?? clientId}`)
        notify('Plan de alimentación quitado')
        return true
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo quitar el plan.', 'warn')
        return false
      }
    },
    [clients, log, notify],
  )

  const registerPayment = useCallback(
    async (input: Pick<Payment, 'clientId' | 'amount' | 'date' | 'days'> & { reference?: string }) => {
      try {
        const data = await apiRegisterPayment(input)
        setPayments((list) => [data.payment, ...list])
        log(
          'payment.register',
          data.payment.id,
          `Registró pago ${data.payment.reference} por $${input.amount} (${input.days} días)`,
        )
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo registrar el pago.',
        }
      }
    },
    [log],
  )

  const reviewPayment = useCallback(
    async (id: string, status: PaymentStatus) => {
      const payment = payments.find((p) => p.id === id)
      if (!payment) return { ok: false, error: 'Pago no encontrado.' }
      if (payment.status !== 'pendiente') {
        return { ok: false, error: 'Ese pago ya fue revisado.' }
      }
      try {
        if (status === 'aprobado') {
          const data = await apiApprovePayment(id)
          setPayments((list) => list.map((p) => (p.id === id ? data.payment : p)))
          setClients((list) =>
            list.map((c) => (c.id === payment.clientId ? { ...c, endDate: data.membership.endDate, paused: false } : c)),
          )
          log('payment.approve', id, `Aprobó ${payment.days} días · ${payment.reference} por $${payment.amount}`)
          return { ok: true, endDate: data.membership.endDate }
        }
        const data = await apiRejectPayment(id)
        setPayments((list) => list.map((p) => (p.id === id ? data.payment : p)))
        log('payment.reject', id, `Rechazó ${payment.reference} por $${payment.amount}`)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo revisar el pago.',
        }
      }
    },
    [log, payments],
  )

  const deletePayment = useCallback(
    async (id: string) => {
      const payment = payments.find((p) => p.id === id)
      if (!payment) return { ok: false, error: 'Pago no encontrado.' }
      try {
        const data = await apiDeletePayment(id)
        setPayments((list) => list.filter((p) => p.id !== id))
        if (payment.status === 'aprobado') {
          setClients((list) =>
            list.map((c) => (c.id === payment.clientId ? { ...c, endDate: data.client.endDate } : c)),
          )
        }
        log(
          'payment.delete',
          id,
          `Eliminó ${payment.reference} por $${payment.amount} (${payment.days} días)`,
        )
        return { ok: true, endDate: data.client.endDate }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo eliminar el pago.',
        }
      }
    },
    [log, payments],
  )

  const saveUser = useCallback(
    async (user: UserAccount) => {
      try {
        const data = await apiCreateStaff({
          name: user.name,
          username: user.username,
          email: user.email,
          phone: user.phone,
          role: user.role,
          password: user.password ?? '',
        })
        setUsers((list) => [...list, data.user])
        log('user.create', data.user.id, `Creó la cuenta ${data.user.username} (${data.user.role})`)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo crear la cuenta.',
        }
      }
    },
    [log],
  )

  const toggleUser = useCallback(
    async (id: string) => {
      try {
        const data = await apiToggleUser(id)
        setUsers((list) => list.map((u) => (u.id === id ? { ...u, active: data.active } : u)))
        log('user.toggle', id, data.active ? 'Reactivó la cuenta' : 'Desactivó la cuenta')
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo cambiar el estado.', 'warn')
      }
    },
    [log, notify],
  )

  const updateOwnAccount = useCallback(
    async (input: { name?: string; password?: string; currentPassword?: string }) => {
      if (!currentUser) return { ok: false, error: 'La sesión expiró. Vuelve a entrar.' }
      const name = input.name?.trim()
      if (input.name !== undefined && !name) {
        return { ok: false, error: 'El nombre no puede quedar vacío.' }
      }
      if (input.password !== undefined) {
        const problem = passwordProblem(input.password)
        if (problem) return { ok: false, error: problem }
      }

      try {
        let username = currentUser.username
        if (name && name !== currentUser.name) {
          const data = await apiUpdateName(name)
          username = data.user.username
          setSession((s) =>
            s ? { ...s, user: { ...s.user, name: data.user.name, username: data.user.username } } : s,
          )
          setClients((list) =>
            currentUser.clientId
              ? list.map((c) => (c.id === currentUser.clientId ? { ...c, name: data.user.name } : c))
              : list,
          )
        }
        if (input.password) {
          if (!input.currentPassword) {
            return { ok: false, error: 'Escribe tu contraseña actual para cambiarla.' }
          }
          await apiChangePassword(username, input.currentPassword, input.password)
        }
        const changed = [name ? 'nombre' : null, input.password ? 'contraseña' : null].filter(Boolean).join(' y ')
        log('account.self_update', currentUser.id, `Actualizó su ${changed}`)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo actualizar tu cuenta.',
        }
      }
    },
    [currentUser, log],
  )

  const loadMyPassword = useCallback(async () => {
    try {
      const data = await apiMyCredentials()
      return data.password
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'No se pudo leer la contraseña.', 'warn')
      return null
    }
  }, [notify])

  const resetClientPassword = useCallback(async (userId: string) => {
    const user = users.find((u) => u.id === userId)
    if (!user?.clientId) return null
    try {
      const data = await apiResetClientPassword(user.clientId)
      notify('Contraseña restablecida · compártela de forma segura')
      return data
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'No se pudo restablecer.', 'warn')
      return null
    }
  }, [notify, users])

  const applySettings = useCallback((settings: Settings) => {
    setState((s) => ({ ...s, settings }))
    setSession((prev) =>
      prev ? { ...prev, modules: settings.roleModules?.[prev.role] ?? prev.modules } : prev,
    )
  }, [])

  const toggleModule = useCallback(
    async (role: Role, module: ModuleCode) => {
      const current = state.settings.roleModules[role] ?? []
      const next = current.includes(module) ? current.filter((m) => m !== module) : [...current, module]
      const roleModules = { ...state.settings.roleModules, [role]: next }
      try {
        const data = await apiSaveSettings({ roleModules })
        applySettings({ ...state.settings, ...data.settings })
        log('module.toggle', `${role}:${module}`, 'Cambió módulos activados del rol')
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No se pudo cambiar el módulo.', 'warn')
      }
    },
    [applySettings, log, notify, state.settings],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      try {
        const data = await apiSaveSettings(patch)
        applySettings({ ...state.settings, ...data.settings })
        log('settings.update', 'system', `Actualizó configuración (${Object.keys(patch).join(', ')})`)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ApiError ? error.message : 'No se pudo guardar la configuración.',
        }
      }
    },
    [applySettings, log, state.settings],
  )

  const runBackup = useCallback(async () => {
    try {
      const data = await apiRunBackup()
      applySettings({ ...state.settings, lastBackup: data.backup.date })
      log('backup.run', 'system', `Respaldo manual de ${Math.round(data.backup.size / 1024)} KB`)
      notify('Respaldo generado y guardado en R2')
      return { ok: true, size: data.backup.size }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No se pudo generar el respaldo.'
      notify(message, 'warn')
      return { ok: false, error: message }
    }
  }, [applySettings, log, notify, state.settings])

  const verifyAudit = useCallback(async () => {
    try {
      const result = await apiVerifyAudit()
      log('audit.verify', 'audit_log', `Verificó ${result.checked} eventos`)
      return result
    } catch (error) {
      return {
        ok: false,
        checked: 0,
        brokenAt: null,
        error: error instanceof ApiError ? error.message : 'No se pudo verificar la cadena.',
      }
    }
  }, [log])

  const activeClients = useMemo(() => clients.filter((c) => !c.archived), [clients])

  const value: AppContextValue = {
    ...state,
    clients,
    users,
    payments,
    routines,
    mealPlans,
    anthro,
    viewRole,
    currentUser,
    booting,
    toast,
    login,
    signIn,
    switchRole,
    logout,
    can,
    activeClients,
    notify,
    dismissToast: () => setToast(null),
    addClient,
    updateOwnAccount,
    loadMyPassword,
    resetClientPassword,
    updateClient,
    archiveClient,
    restoreClient,
    addAnthro,
    saveRoutine,
    deleteRoutine,
    assignRoutine,
    unassignRoutine,
    customizeRoutine,
    saveMealPlan,
  deleteMealPlan,
    assignMealPlan,
    uploadMealPdf,
    removeMealPdf,
    clearFoodPlan,
  unassignMealPlan,
    registerPayment,
    reviewPayment,
    deletePayment,
    saveUser,
    toggleUser,
    toggleModule,
    updateSettings,
    runBackup,
    verifyAudit,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider')
  return ctx
}
