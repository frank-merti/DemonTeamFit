import { useMemo } from 'react'
import { useApp } from '../store/AppStore'
import type { Client } from '../types'

/**
 * Un coach solo ve a sus propios clientes. Admin y super admin ven el padrón
 * completo (el super admin, solo agregados y facturación).
 * El filtro vive aquí para que ninguna pantalla lo olvide.
 */
export function useScopedClients(): Client[] {
  const { clients, viewRole, currentUser } = useApp()
  return useMemo(() => {
    if (viewRole === 'coach' && currentUser) {
      return clients.filter((c) => c.coachId === currentUser.id)
    }
    return clients
  }, [clients, viewRole, currentUser])
}
