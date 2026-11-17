import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { readTheme, setTheme } from '../lib/theme'
import { cx } from './ui'

/**
 * Interruptor de modo claro/oscuro. Muestra el icono del modo al que se
 * cambiaría (sol en oscuro, luna en claro) y guarda la elección del usuario.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setLocalTheme] = useState<'light' | 'dark'>(() => readTheme())

  useEffect(() => {
    setLocalTheme(readTheme())
  }, [])

  return (
    <button
      onClick={() => setLocalTheme(setTheme(theme === 'dark' ? 'light' : 'dark'))}
      className={cx(
        'grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink',
        className,
      )}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-pressed={theme === 'dark'}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
