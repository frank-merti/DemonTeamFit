import type {
  AnthroRecord,
  AuditEntry,
  Client,
  MealPlan,
  Payment,
  Routine,
  Settings,
  UserAccount,
} from '../types'
import { addDays, todayISO } from '../lib/format'

const T = todayISO()

/* ------------------------------------------------------------------ */
/* Base de datos inicial                                               */
/*                                                                     */
/* Arranque limpio: sin clientes, rutinas, planes, pagos ni historial.  */
/* Solo existen las cuentas de staff. Los clientes se dan de alta desde */
/* la app.                                                             */
/* ------------------------------------------------------------------ */

export const seedClients: Client[] = []
export const seedAnthro: AnthroRecord[] = []
export const seedRoutines: Routine[] = []
export const seedMealPlans: MealPlan[] = []
export const seedPayments: Payment[] = []
export const seedAudit: AuditEntry[] = []

export const seedUsers: UserAccount[] = [
  {
    id: 'u-admin-1',
    username: 'admin.demo',
    password: 'AdminDemo!',
    name: 'Admin Demo',
    email: 'admin@example.com',
    phone: '55 0000 0000',
    role: 'admin',
    // La misma cuenta puede entrar como administrador o super administrador.
    roles: ['admin', 'super_admin'],
    active: true,
  },
  {
    id: 'u-coach-1',
    username: 'coach.demo',
    password: 'CoachDemo!',
    name: 'Coach Demo',
    email: 'coach@example.com',
    phone: '55 0000 0001',
    role: 'coach',
    roles: ['coach'],
    active: true,
  },
]

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

export const seedSettings: Settings = {
  gymName: 'Entrenamiento',
  maxClients: 30,
  bank: 'Banco Demo',
  bank2: '',
  clabe: '000 000 000 0000 0000 0',
  clabe2: '',
  alias: 'DEMO.MX',
  coachPhone: '5500000000',
  lastBackup: addDays(T, -2),
  roleModules: {
    cliente: ['inicio', 'rutinas', 'planes', 'antropometria'],
    coach: ['inicio', 'clientes', 'antropometria', 'rutinas', 'planes', 'pagos'],
    admin: ['inicio', 'clientes', 'antropometria', 'rutinas', 'planes', 'pagos', 'usuarios', 'auditoria'],
    super_admin: ['inicio', 'pagos', 'usuarios', 'auditoria', 'sistema'],
  },
}
