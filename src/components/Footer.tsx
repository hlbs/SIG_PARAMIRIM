import InstitutionalLogos from '@/components/InstitutionalLogos'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="site-footer panel">
      <section>
        <h2>Plataforma web para pesquisa, ensino e análise territorial.</h2>
        <p>
          Estrutura dedicada à divulgação científica da bacia do rio Paramirim com SIG Web, biblioteca técnica e
          informações sistematizadas.
        </p>
      </section>

      <section>
        <h2>Navegação</h2>
        <div className="footer-links">
          <Link to="/sigweb">SIG Web</Link>
          <Link to="/trabalhos">Trabalhos</Link>
          <Link to="/about">Sobre</Link>
        </div>
      </section>

      <section>
        <h2>Apoio</h2>
        <InstitutionalLogos variant="footer" />
      </section>

      <small className="footer-copy">© 2025 SIG Paramirim é uma plataforma integrada ao projeto Boquira Consciente (BUQCons)</small>
    </footer>
  )
}

