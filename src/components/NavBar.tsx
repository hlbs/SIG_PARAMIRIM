import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import { NavLink } from 'react-router-dom'

type Theme = 'light' | 'dark'

function getThemeFromDocument(): Theme {
  if (typeof document === 'undefined') return 'light'
  const current = document.documentElement.getAttribute('data-theme')
  return current === 'dark' ? 'dark' : 'light'
}

const links = [
  { to: '/', label: 'Início' },
  { to: '/sigweb', label: 'SIG Web' },
  { to: '/trabalhos', label: 'Trabalhos' },
  { to: '/about', label: 'Sobre' }
]

export default function NavBar() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light'
    const saved = localStorage.getItem('sig-theme')
    if (saved === 'dark' || saved === 'light') return saved
    return getThemeFromDocument()
  })

  useEffect(() => {
    setTheme(getThemeFromDocument())

    const observer = new MutationObserver(() => {
      setTheme(getThemeFromDocument())
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })

    return () => observer.disconnect()
  }, [])

  const logoSrc =
    theme === 'dark' ? '/assets/logo-placeholder_darkmode.svg' : '/assets/logo-placeholder.svg'

  return (
    <header className="site-header panel">
      <div className="top-line">
        <NavLink to="/" className="brand" aria-label="Página inicial SIG Paramirim">
          <img src={logoSrc} alt="Logo SIG Paramirim" className="brand-logo" />
          <div>
            <p className="brand-kicker">Plataforma de divulgação científica</p>
            <strong className="brand-title">SIG PARAMIRIM</strong>
          </div>
        </NavLink>

        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <nav className="main-nav" aria-label="Navegação principal">
        {links.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
