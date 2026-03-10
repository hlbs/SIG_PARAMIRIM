import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('sig-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())
  const isDark = theme === 'dark'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('sig-theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <button
      type="button"
      className={`theme-toggle ${isDark ? 'dark' : 'light'}`}
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label="Alternar modo claro e escuro"
      title={isDark ? 'Modo escuro ativo' : 'Modo claro ativo'}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">
          {isDark ? (
            <svg viewBox="0 0 24 24" className="theme-icon moon">
              <path d="M21 14.2A9 9 0 0 1 9.8 3a9 9 0 1 0 11.2 11.2Z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="theme-icon sun">
              <circle cx="12" cy="12" r="5.1" fill="currentColor" />
              <rect x="11.25" y="1.5" width="1.5" height="3.3" rx="0.75" fill="currentColor" />
              <rect x="11.25" y="19.2" width="1.5" height="3.3" rx="0.75" fill="currentColor" />
              <rect x="19.2" y="11.25" width="3.3" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="1.5" y="11.25" width="3.3" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="17.88" y="4.98" width="1.5" height="3.1" rx="0.75" transform="rotate(45 18.63 6.53)" fill="currentColor" />
              <rect x="4.62" y="16.24" width="1.5" height="3.1" rx="0.75" transform="rotate(45 5.37 17.79)" fill="currentColor" />
              <rect x="15.92" y="17.88" width="3.1" height="1.5" rx="0.75" transform="rotate(45 17.47 18.63)" fill="currentColor" />
              <rect x="4.66" y="4.62" width="3.1" height="1.5" rx="0.75" transform="rotate(45 6.21 5.37)" fill="currentColor" />
            </svg>
          )}
        </span>
      </span>
      <span className="theme-toggle-label">{isDark ? 'Modo escuro' : 'Modo claro'}</span>
    </button>
  )
}
