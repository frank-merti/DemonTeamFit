import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './store/AppStore'
import { AccessDenied, AppShell } from './components/AppShell'
import { Button } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Routines from './pages/Routines'
import Exercises from './pages/Exercises'
import MealPlans from './pages/MealPlans'
import Payments from './pages/Payments'
import UsersPage from './pages/Users'
import Audit from './pages/Audit'
import System from './pages/System'
import ClientPortal from './pages/ClientPortal'
import Landing from './pages/Landing'
import type { ModuleCode } from './types'
import { Link } from 'react-router-dom'

function Gate({ module, children }: { module: ModuleCode; children: React.ReactNode }) {
  const { can } = useApp()
  if (!can(module)) return <AccessDenied module={module} />
  return <>{children}</>
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Error 404</p>
      <h1 className="mt-2 text-xl font-semibold">Pantalla no encontrada</h1>
      <p className="mt-1 text-[13px] text-muted">El enlace no existe en esta versión de la demo.</p>
      <Link to="/" className="mt-4 inline-block">
        <Button size="sm" variant="secondary">Volver al inicio</Button>
      </Link>
    </div>
  )
}

function Root() {
  const { viewRole, booting } = useApp()

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Entrenamiento</p>
          <p className="mt-2 text-[13px] text-muted">Restaurando tu sesión…</p>
        </div>
      </div>
    )
  }

  if (!viewRole) {
    return (
      <Routes>
        {/* La landing es la pantalla raíz; el login vive en /login. */}
        <Route path="/" element={<Landing />} />
        <Route path="/servicios" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      {/* La landing de servicios es pública para cualquier sesión. */}
      <Route path="/servicios" element={<Landing />} />
      {viewRole === 'cliente' ? (
        <>
          <Route path="/mi/*" element={<ClientPortal />} />
          <Route path="*" element={<Navigate to="/mi" replace />} />
        </>
      ) : (
        <Route element={<AppShell />}>
          <Route index element={<Gate module="inicio"><Dashboard /></Gate>} />
          <Route path="clientes" element={<Gate module="clientes"><Clients /></Gate>} />
          <Route path="clientes/:id" element={<Gate module="clientes"><ClientDetail /></Gate>} />
          <Route path="clientes/:id/:tab" element={<Gate module="clientes"><ClientDetail /></Gate>} />
          <Route path="rutinas" element={<Gate module="rutinas"><Routines /></Gate>} />
          <Route path="ejercicios" element={<Gate module="rutinas"><Exercises /></Gate>} />
          <Route path="planes" element={<Gate module="planes"><MealPlans /></Gate>} />
          <Route path="pagos" element={<Gate module="pagos"><Payments /></Gate>} />
          <Route path="usuarios" element={<Gate module="usuarios"><UsersPage /></Gate>} />
          <Route path="auditoria" element={<Gate module="auditoria"><Audit /></Gate>} />
          <Route path="sistema" element={<Gate module="sistema"><System /></Gate>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      )}
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Root />
      </HashRouter>
    </AppProvider>
  )
}
