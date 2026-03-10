type Variant = 'header' | 'footer'

type Logo = {
  id: string
  label: string
  src: string
  href: string
}

const logos: Logo[] = [
  { id: 'ufba', label: 'UFBA', src: '/assets/logos/ufba.svg', href: 'https://ufba.br/' },
  {
    id: 'igeo',
    label: 'Instituto de Geologia',
    src: '/assets/logos/instituto-geologia.svg',
    href: 'https://pggeologia.ufba.br/'
  },
  { id: 'capes', label: 'CAPES', src: '/assets/logos/capes.svg', href: 'https://www.gov.br/capes/pt-br' }
]

export default function InstitutionalLogos({ variant }: { variant: Variant }) {
  return (
    <div className={`institutional-logos ${variant}`} aria-label="Marcas institucionais">
      {logos.map((logo) => (
        <a
          key={logo.id}
          className="logo-item"
          href={logo.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir site de ${logo.label} em nova guia`}
        >
          <img src={logo.src} alt={logo.label} loading="lazy" />
        </a>
      ))}
    </div>
  )
}
