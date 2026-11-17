export type Role = 'cliente' | 'coach' | 'admin' | 'super_admin'

export type ModuleCode =
  | 'inicio'
  | 'clientes'
  | 'antropometria'
  | 'rutinas'
  | 'planes'
  | 'pagos'
  | 'usuarios'
  | 'auditoria'
  | 'sistema'

export type ClientStatus = 'activo' | 'por_vencer' | 'vencido' | 'pausado'

export interface Client {
  id: string
  name: string
  phone: string
  email: string
  birthDate: string
  goal: string
  coachId: string
  startDate: string
  endDate: string
  /** Inicio del ciclo pagado vigente (última renovación aprobada); si no hay, el alta. */
  cycleStart?: string
  price: number
  archived: boolean
  paused?: boolean
  lastCheckin: string
  adherence: number
  notes?: string
  routineId?: string
  mealPlanId?: string
  /** Plan de alimentación en PDF que sube el coach (KV: meal-pdfs/). */
  mealPdfKey?: string
  mealPdfName?: string
  mealPdfUpdatedAt?: string
  emergencyName?: string
  emergencyPhone?: string
  /** Sexo biológico: requerido para Kerr/Lee/Heath-Carter y gasto energético. */
  sexo?: 'masculino' | 'femenino'
}

export interface AnthroRecord {
  id: string
  clientId: string
  date: string
  weight: number
  height: number
  bodyFat: number
  waist: number
  hip: number
  arm: number
  armFlexed: number
  thigh: number
  calf: number
  skinfoldTriceps: number
  skinfoldBiceps: number
  skinfoldSubscapular: number
  skinfoldIliac: number
  skinfoldSupraspinal: number
  skinfoldAbdominal: number
  skinfoldThigh: number
  skinfoldCalf: number
  diameterWrist: number
  diameterElbow: number
  diameterKnee: number
  notes?: string
  createdBy: string
  /** Quién capturó la medición. El cliente puede registrar su propio peso. */
  source?: 'coach' | 'cliente'
}

export interface Exercise {
  id: string
  name: string
  sets: number
  reps: string
  rest: string
  /** Descanso recomendado en segundos, listo para el temporizador del portal. */
  restSeconds?: number | null
  /** Enlace con la biblioteca del coach. `null` = ejercicio personalizado. */
  catalogId?: string | null
  notes?: string
  /** Llave en KV de la imagen del ejercicio (`exercise-images/…`). */
  imageKey?: string | null
  /** Cardio: se programa por minutos en lugar de series y repeticiones. */
  cardio?: boolean
  minutes?: number | null
}

export type ExerciseFeeling = 'like' | 'dislike'

export interface ExerciseCatalogItem {
  id: string
  name: string
  muscleGroup: string
  equipment: string
  instructions: string
  /** Cardio: el coach lo programa por minutos en la rutina. */
  cardio: boolean
  /** Llave en KV de la imagen del ejercicio en la biblioteca. */
  imageKey?: string | null
  /** Checkbox por cliente: true si el coach lo recomendó. */
  recommended: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface ExerciseLogSet {
  id: string
  position: number
  weight: number | null
  reps: number
  restSeconds: number | null
}

export interface ExerciseLog {
  id: string
  clientId: string
  routineId: string | null
  catalogId: string | null
  exerciseName: string
  date: string
  notes: string
  createdAt: string
  sets: ExerciseLogSet[]
}

export interface ExerciseFeedback {
  routineId: string
  exerciseName: string
  value: ExerciseFeeling
  updatedAt: string
}

export interface RoutineCheckin {
  id: string
  routineId: string
  date: string
  /** RPE subjetivo: 1 = ligera, 10 = demoledora. */
  intensity: number
  notes: string
  createdAt: string
}

export interface RoutineDay {
  id: string
  name: string
  focus: string
  exercises: Exercise[]
}

export interface Routine {
  id: string
  name: string
  goal: string
  level: 'Principiante' | 'Intermedio' | 'Avanzado'
  weeks: number
  days: RoutineDay[]
  assignedTo: string[]
  updatedAt: string
  /** Cliente dueño cuando la rutina es una copia personalizada. */
  clientId?: string
  /** Plantilla de la que se copió una rutina personalizada. */
  sourceRoutineId?: string
}

export interface MealItem {
  id: string
  food: string
  qty: string
}

export interface Meal {
  id: string
  slot: string
  items: MealItem[]
}

export interface MealPlan {
  id: string
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  meals: Meal[]
  assignedTo: string[]
  updatedAt: string
}

export type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado'

export interface Payment {
  id: string
  clientId: string
  /** Lo entrega la API para que el super admin pueda leer sin ficha clínica. */
  clientName?: string
  amount: number
  reference: string
  date: string
  status: PaymentStatus
  method: string
  /** Días de membresía que cubre el pago: 30, 60 o 90. */
  days: number
  receiptName?: string
  reviewedBy?: string
  reviewedAt?: string
}

export interface UserAccount {
  id: string
  /** Nombre de acceso. Se normaliza sin acentos ni espacios. */
  username: string
  /** Ya no se guarda en el navegador; se consulta a la API cuando hace falta. */
  password?: string
  name: string
  email: string
  phone: string
  role: Role
  /** Roles con los que esta cuenta puede iniciar sesión. */
  roles?: Role[]
  active: boolean
  clientId?: string
  /** Solo clientes: su contraseña se puede recuperar con auditoría. */
  recoverable?: boolean
}

export interface AuditEntry {
  id: string
  actor: string
  actorRole: Role
  action: string
  entity: string
  entityId?: string
  detail: string
  at: string
  ip?: string
  hash?: string
  prevHash?: string
}

export interface Settings {
  gymName: string
  maxClients: number
  bank: string
  bank2: string
  clabe: string
  clabe2: string
  alias: string
  coachPhone: string
  roleModules: Record<Role, ModuleCode[]>
  lastBackup: string
}

export const ROLE_LABEL: Record<Role, string> = {
  cliente: 'Cliente',
  coach: 'Coach',
  admin: 'Administrador',
  super_admin: 'Super administrador',
}

export const MODULE_LABEL: Record<ModuleCode, string> = {
  inicio: 'Inicio',
  clientes: 'Clientes',
  antropometria: 'Antropometría',
  rutinas: 'Rutinas',
  planes: 'Planes de alimentación',
  pagos: 'Membresías y pagos',
  usuarios: 'Usuarios y roles',
  auditoria: 'Auditoría',
  sistema: 'Sistema y respaldos',
}

export const ALL_MODULES: ModuleCode[] = [
  'inicio',
  'clientes',
  'antropometria',
  'rutinas',
  'planes',
  'pagos',
  'usuarios',
  'auditoria',
  'sistema',
]
