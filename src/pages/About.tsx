import { useState, type CSSProperties } from 'react'

type AboutSection = {
  id: string
  label: string
  title: string
  text: string
  points: string[]
  footerNote?: string
  image?: string
  imageAlt?: string
  imageScale?: number
  imagePosition?: string
}

const sections: AboutSection[] = [
  {
    id: 'desenvolvedor',
    label: 'Desenvolvedor',
    title: 'Hermes Luis Barros Santos',
    image: '/assets/people/desenvolvedor.svg',
    imageAlt: 'Foto de Hermes Luis Barros Santos',
    imageScale: 1.52,
    imagePosition: '50% 43%',
    text: 'Engenheiro Civil e Especialista em Recursos Hídricos e doutorando do Programa de Pós-graduação em Geologia (PPGEOL) na Universidade Federal da Bahia (UFBA), na área de concentração da geologia ambiental, hidrogeologia e recursos hídricos e linha de pesquisa da hidrogeologia de aquíferos granulares, cársticos e fissurais. Possui experiência em hidrologia aplicada, análise de dados e geoprocessamento.',
    points: []
  },
  {
    id: 'orientador',
    label: 'Orientador',
    title: 'José Ângelo Sebastião Araújo dos Anjos',
    image: '/assets/people/orientador.svg',
    imageAlt: 'Foto de José Ângelo Sebastião Araújo dos Anjos',
    imageScale: 1.3,
    imagePosition: '50% 44%',
    text: 'Bacharel em Geologia pela Universidade Federal da Bahia, Mestre em Engenharia Mineral pela Universidade de São Paulo e Doutor em Engenharia Mineral pela Universidade de São Paulo. Atualmente é pesquisador da Fundação de Amparo à Pesquisa do Estado da Bahia, professor titular I da Universidade Salvador e professor Associado IV da Universidade Federal da Bahia. Tem experiência na área de Geociências, com ênfase em Geologia Ambiental, atuando principalmente nos seguintes temas: Economia Circular, Sustentabilidade, Gestão Ambiental, Impactos Ambientais, Mineração, Metais pesados.',
    points: []
  },
  {
    id: 'coorientador',
    label: 'Co-Orientador',
    title: 'Rodrigo Lilla Manzione',
    image: '/assets/people/coorientador.svg',
    imageAlt: 'Foto de Rodrigo Lilla Manzione',
    imageScale: 1.32,
    imagePosition: '50% 46%',
    text: 'Graduou-se em Engenharia Agronômica pela Universidade Estadual Paulista Júlio de Mesquita Filho (UNESP) em 1999, obteve o título de mestre em Agronomia (Energia na Agricultura) pela UNESP em 2002, ambos pela Faculdade de Ciências Agronômicas (FCA), Campus Botucatu, o título de doutor em sensoriamento remoto pelo Instituto Nacional de Pesquisas Espaciais (INPE) em 2007, em São José dos Campos, e a habilitação em Hidrogeografia e Agrometeorologia pela UNESP em 2016, no Campus Ourinhos. Possui experiência na área de agronomia e meio ambiente, com ênfase em modelagem estatística, atuando principalmente nos seguintes temas: pedologia, hidrogeologia, agricultura de precisão, geoestatística, séries temporais, geoprocessamento, sistemas de informação geográfica e mapeamento de riscos e incertezas. Foi bolsista do programa PDEE-CAPES, realizando estágio de doutorado no exterior (sanduíche) no instituto ALTERRA, da Universidade de Wageningen, Holanda. Desde 2008, é professor titular da Universidade Estadual Paulista Júlio de Mesquita Filho, onde leciona e pesquisa nas áreas de geoprocessamento, recursos hídricos e agrometeorologia no curso de Geografia do Campus de Ourinhos (CO) até 2016, de 2017 a 2022 no curso de Engenharia de Biossistemas da Faculdade de Ciências e Engenharia (FCE) de Tupã e, desde o segundo semestre de 2022, no curso de Geografia da Escola de Ciências, Tecnologia e Educação (FCTE) de Ourinhos. Foi chefe do Departamento de Engenharia de Biossistemas (DEB) da UNESP/FCE-Tupã de fevereiro de 2020 a janeiro de 2022. Atua nos programas de pós-graduação em Engenharia Agrícola da UNESP/FCA-Botucatu, Geografia da UNESP/FCT-Pres. Prudente e Geociências e Meio Ambiente da UNESP/IGCE-Rio Claro, orientando mestrandos e doutorandos. Atua também nos cursos de mestrado profissional em Recursos Hídricos da UNESP/FCT-Presidente Prudente e em Gestão e Regulação de Recursos Hídricos (PROFÁGUA) da UNESP/FEIS-Ilha Solteira. Desde 2020 é membro adjunto da Escola de Recursos Naturais (SNR) da Universidade de Nebraska (UNL) em Lincoln, EUA.',
    points: []
  },
  {
    id: 'projeto',
    label: 'Projeto',
    title: 'Projeto SIG Paramirim',
    text: 'O SIG PARAMIRIM é uma plataforma interativa de geoinformação desenvolvida como parte integrante do projeto Boquira Consciente (BUQCons). Seu principal objetivo é oferecer ferramentas acessíveis e intuitivas para visualização, análise e compreensão espacial dos recursos naturais e socioambientais da bacia hidrográfica do rio Paramirim.',
    points: [],
    footerNote:
      'Dúvidas, críticas ou sugestões? Por favor, entre em contato conosco pelos seguintes e-mails: hermes.santos@ufba.br e jose.anjos@ufba.br.'
  },
  {
    id: 'programa',
    label: 'Programa de Pós-graduação',
    title: 'Programa de Pós-graduação',
    text: 'Fundado em 1976 (Mestrado) e expandido para Doutorado em 1992, o programa de pós-graduação em geologia da Universidade Federal da Bahia surgiu para responder à rica diversidade geológica da Bahia, que abrange desde o Cráton do São Francisco até a mais extensa linha de costa do Brasil. Com mais de 44 anos de história, o curso consolidou-se por meio de cooperações internacionais e apoio de agências de fomento, sendo o pioneiro no doutorado em Geociências no Nordeste. O programa destaca-se pelo forte impacto socioeconômico e científico, tendo formado centenas de mestres e doutores. Suas pesquisas equilibram a exploração de recursos minerais e energéticos com a sustentabilidade ambiental, colaborando diretamente na formulação de políticas públicas e na gestão territorial do estado e do país.',
    points: [
      'Geologia Marinha, Costeira e Sedimentar;',
      'Petrologia, Metalogênese e Exploração Mineral;',
      'Geologia Ambiental, Hidrogeologia e Recursos Hídricos.'
    ]
  },
  {
    id: 'impacto-social',
    label: 'Importância social',
    title: 'Importancia social do SIG Paramirim',
    text: 'A importância social do SIG PARAMIRIM reside na democratização do conhecimento técnico e no fortalecimento da governança ambiental participativa na bacia do rio Paramirim. Ao integrar dados geoespaciais complexos em uma interface acessível, a plataforma atua como um instrumento de cidadania, permitindo que comunidades locais, educadores e gestores públicos compreendam as dinâmicas do território e participem ativamente da preservação dos recursos naturais. No contexto do projeto Boquira Consciente (BUQCons), essa ferramenta é fundamental para a mediação de conflitos pelo uso da água e do solo, oferecendo transparência sobre a vulnerabilidade de aquíferos e áreas de preservação.',
    points: []
  }
]

export default function About() {
  const [activeId, setActiveId] = useState(sections[0].id)
  const active = sections.find((item) => item.id === activeId) ?? sections[0]
  const photoStyle = active.image
    ? ({
        '--about-photo-scale': active.imageScale ?? 1.3,
        '--about-photo-position': active.imagePosition ?? '50% 50%'
      } as CSSProperties)
    : undefined

  return (
    <section className="page-card about-shell">
      <header className="section-header">
        <p className="eyebrow">Sobre</p>
        <h1>Institucional</h1>
        <p>Conheça os responsáveis, o contexto acadêmico e a relevância social do SIG PARAMIRIM.</p>
      </header>

      <div className="about-layout">
        <nav className="about-nav" aria-label="Tópicos da seção sobre">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`about-tab${section.id === active.id ? ' active' : ''}`}
              onClick={() => setActiveId(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <article className="about-content">
          <h2>{active.title}</h2>
          <div className={`about-content-scroll${active.image ? ' has-image' : ''}`}>
            <div className="about-text-stack">
              <p>{active.text}</p>

              {active.points.length > 0 && (
                <ul className="clean-list">
                  {active.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}

              {active.footerNote && <p className="about-content-note">{active.footerNote}</p>}
            </div>

            {active.image && (
              <figure className="about-photo-frame" style={photoStyle}>
                <img src={active.image} alt={active.imageAlt || active.title} loading="lazy" />
              </figure>
            )}
          </div>
        </article>
      </div>
    </section>
  )
}
