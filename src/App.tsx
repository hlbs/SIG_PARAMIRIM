import { Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { AppRoutes } from '@/app/routes'
import NavBar from '@/components/NavBar'
import Footer from '@/components/Footer'
import RouteProgress from '@/components/RouteProgress'

export default function App() {
  const location = useLocation()

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <RouteProgress routeKey={location.key || location.pathname} />
      <NavBar />
      <main id="conteudo" className="site-main">
        <Suspense fallback={<section className="page-card report-placeholder">Carregando página...</section>}>
          <AppRoutes />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}

