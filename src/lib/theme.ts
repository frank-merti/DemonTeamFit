/**
 * Modo claro / oscuro de la app.
 *
 * La preferencia se guarda en localStorage; si el usuario nunca eligió, se
 * sigue la preferencia del sistema. El atributo `data-theme` en <html>
 * cambia las variables de color de index.css en toda la aplicación.
 */

export type ThemeSetting = 'light' | 'dark'

const STORAGE_KEY = 'entrenamiento-theme'

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches

export const readTheme = (): ThemeSetting => {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return systemPrefersDark() ? 'dark' : 'light'
}

export const applyTheme = (setting: ThemeSetting) => {
  document.documentElement.dataset.theme = setting
}

export const setTheme = (setting: ThemeSetting): ThemeSetting => {
  localStorage.setItem(STORAGE_KEY, setting)
  applyTheme(setting)
  return setting
}

/** Aplica el tema guardado y reacciona si el sistema cambia y no hay elección propia. */
export const initTheme = () => {
  applyTheme(readTheme())
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (!localStorage.getItem(STORAGE_KEY)) applyTheme(readTheme())
  })
}
