# SIG Paramirim - Plataforma Web

Aplicacao React para divulgacao cientifica da bacia hidrografica do rio Paramirim, com foco em tres eixos:

- SIG Web dedicado (camadas vetoriais e raster)
- Biblioteca de trabalhos tecnicos (PDFs locais)
- Dashboard interativo do report da bacia (CSV)

## Stack

- React 18 + TypeScript
- Vite
- React Router
- Leaflet + React Leaflet
- PapaParse
- GeoRaster + GeoRasterLayer (camadas GeoTIFF)

## Executar localmente

```bash
npm install
npm run dev
```

## Build de producao

```bash
npm run build
npm run preview
```

## Estrutura importante

- `src/pages/SigWeb.tsx`: SIG Web com vetores e raster
- `src/pages/Home.tsx`: home institucional + dashboard do report CSV
- `src/pages/Publications.tsx`: secao de trabalhos com PDFs da pasta `public/papers`
- `src/pages/About.tsx`: UX interativa com abas institucionais
- `src/components/report/ReportDashboard.tsx`: leitura e visualizacao do `report_bacia_paramirim.csv`
- `src/components/map/GeoRasterOverlay.tsx`: renderizacao de GeoTIFF no mapa

## Pastas preparadas para insercao de ativos

- Logos institucionais: `public/assets/logos`
  - `ufba.svg`
  - `nucleo-pesquisa.svg`
  - `instituto-geologia.svg`
- Fotos da secao Sobre: `public/assets/people`
  - `desenvolvedor.svg`
  - `orientador.svg`
  - `coorientador.svg`

Voce pode substituir os placeholders mantendo os mesmos nomes de arquivo.
