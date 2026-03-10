import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="page-card not-found">
      <p className="eyebrow">Erro 404</p>
      <h1>Página não encontrada</h1>
      <p>A rota solicitada não existe ou foi alterada durante a reorganização da plataforma.</p>
      <Link to="/" className="btn-primary">Voltar para o início</Link>
    </section>
  )
}
