# DemonTeamFit

Esqueleto de portafolio de una plataforma web de gestión para entrenadores
personales: clientes, membresías, rutinas de ejercicio, planes de
alimentación, pagos y antropometría.

> **Versión de portafolio.** Este repositorio contiene únicamente el
> **frontend** (interfaz de usuario). El backend (API y base de datos) no
> está incluido, y la base demo viene **vacía por diseño** — no hay datos
> de clientes, ni números de cuenta, ni teléfonos, ni credenciales reales.

## Qué incluye

- **Landing pública** con presentación de servicios y planes.
- **App de escritorio responsive** (React + React Router) con:
  - Login y sesiones por rol (cliente, coach, admin, super admin).
  - Gestión de clientes, membresías y pagos.
  - Constructor de rutinas con catálogo de ejercicios.
  - Planes de alimentación con generación de PDF (jsPDF).
  - Módulo de antropometría (fraccionamiento corporal y somatotipo).
  - Portal del cliente («Tu plan diario»).
- **Tema claro/oscuro** con Tailwind CSS 4.
- **Gráficas** con Recharts, **importación/exportación** de Excel.

## Stack

| Capa | Herramientas |
|---|---|
| UI | React 19, React Router 7, Tailwind CSS 4, lucide-react |
| Datos/visual | Recharts, read/write-excel-file, jspdf |
| Build | Vite 8, TypeScript, oxlint |

## Cómo correrlo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producción en dist/
```

Sin el backend, la landing y el esqueleto de la app son navegables; el
login requiere el servicio de autenticación, que por privacidad no forma
parte de este repositorio.

## Notas de privacidad

- Los datos demo (`src/data/mock.ts`) usan cuentas y bancos ficticios.
- El backend, la base de datos y las llaves de API viven fuera de este repo.
