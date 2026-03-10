import { useEffect, useMemo, useState } from 'react'
import { papers } from '@/data/papers'

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export default function Publications() {
  const [search, setSearch] = useState('')
  const [showSkeleton, setShowSkeleton] = useState(true)

  const filtered = useMemo(() => {
    const term = normalize(search.trim())
    if (!term) return papers

    return papers.filter((paper) => {
      return [paper.code, paper.title, paper.fileName].some((field) => normalize(field).includes(term))
    })
  }, [search])

  useEffect(() => {
    const timerId = window.setTimeout(() => setShowSkeleton(false), 900)
    return () => window.clearTimeout(timerId)
  }, [])

  const skeletonCount = Math.min(Math.max(filtered.length, 3), 6)

  return (
    <section className="page-card publications-card">
      <header className="section-top publications-header">
        <div>
          <p className="eyebrow">Biblioteca técnica</p>
          <h1>Trabalhos publicados</h1>
          <p className="subtle">
            Acervo digital da bacia do Rio Paramirim com leitura rápida, busca contextual e acesso direto aos PDFs.
          </p>
        </div>

        <div className="publications-toolbar">
          <div className="publications-kpis" aria-label="Resumo dos trabalhos">
            <article>
              <strong>{papers.length}</strong>
              <span>Documentos</span>
            </article>
            <article>
              <strong>{filtered.length}</strong>
              <span>Visíveis</span>
            </article>
          </div>

          <label className="search-box">
            <span>Buscar trabalho</span>
            <input
              type="search"
              value={search}
              placeholder="Título, código ou palavra-chave"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      </header>

      <div className="publication-grid refined">
        {showSkeleton
          ? Array.from({ length: skeletonCount }).map((_, index) => (
              <article key={`skeleton-${index}`} className="publication-item refined publication-skeleton" aria-hidden="true">
                <header className="publication-top">
                  <span className="skeleton-bar skeleton-code" />
                  <span className="skeleton-bar skeleton-ref" />
                </header>

                <div className="publication-skeleton-title">
                  <span className="skeleton-bar skeleton-title-line" />
                  <span className="skeleton-bar skeleton-title-line short" />
                  <span className="skeleton-bar skeleton-title-line shorter" />
                </div>

                <div className="publication-actions">
                  <span className="skeleton-bar skeleton-button" />
                  <span className="skeleton-bar skeleton-button" />
                </div>
              </article>
            ))
          : filtered.map((paper) => (
              <article key={paper.id} className="publication-item refined">
                <header className="publication-top">
                  <p className="publication-code">Documento {paper.code}</p>
                  <span className="publication-ref">Ref. {paper.code}</span>
                </header>

                <h2 className="publication-title">{paper.title}</h2>

                <div className="publication-actions">
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary publication-action-btn"
                  >
                    Abrir PDF
                  </a>
                  <a
                    href={paper.url}
                    download={paper.fileName}
                    className="btn-primary publication-action-btn"
                  >
                    Download
                  </a>
                </div>
              </article>
            ))}
      </div>

      {!showSkeleton && filtered.length === 0 && (
        <p className="empty-note">Nenhum trabalho encontrado para o filtro informado.</p>
      )}
    </section>
  )
}
