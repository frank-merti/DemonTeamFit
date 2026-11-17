import { normalizeName } from './format'

/**
 * Resuelve un renglón de rutina contra la biblioteca del coach:
 * 1. por su enlace (catalogId),
 * 2. por nombre exacto normalizado (sin acentos, sin espacios extra),
 * 3. por nombre contenido en cualquiera de las direcciones
 *    («Press de banca con barra» ↔ «Press de banca»).
 *
 * Así las fotos e instrucciones del catálogo aparecen en el portal aunque el
 * renglón de la rutina no esté enlazado.
 */
export function resolveCatalogItem<T extends { id: string; name: string }>(
  catalog: T[],
  name: string,
  catalogId?: string | null,
): T | undefined {
  if (catalog.length === 0) return undefined
  if (catalogId) {
    const linked = catalog.find((item) => item.id === catalogId)
    if (linked) return linked
  }
  const key = normalizeName(name)
  if (!key) return undefined
  const exact = catalog.find((item) => normalizeName(item.name) === key)
  if (exact) return exact
  return catalog.find((item) => {
    const candidate = normalizeName(item.name)
    return candidate.length > 0 && (candidate.includes(key) || key.includes(candidate))
  })
}
