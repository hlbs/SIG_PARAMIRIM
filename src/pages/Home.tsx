import { Link } from 'react-router-dom'
import ReportDashboard from '@/components/report/ReportDashboard'

export default function Home() {
  return (
    <>
      <section className="page-card hero-card">
        <p className="eyebrow">Plataforma de divulgação científica</p>
        <h1>Um Sistema de Informação Geográfico (SIG) da bacia hidrográfica do Rio Paramirim</h1>
        <p>
          Para além da academia, uma ferramenta de suporte para o setor público e privado.
        </p>

        <div className="hero-actions">
          <Link to="/sigweb" className="btn-primary">Abrir SIG Web</Link>
          <Link to="/trabalhos" className="btn-secondary">Abrir Trabalhos</Link>
        </div>
      </section>

      <ReportDashboard />
    </>
  )
}
