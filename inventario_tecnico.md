# Inventário técnico — estado atual do projeto (Leaflet)

## Estrutura & Páginas
- **Página única**: `index.html` (título: “SIG PARAMIRIM”), com **sidebar** (acordeões) + **mapa** em `<div id="map">`.
- **Assets locais** (nomenclatura típica observada em projetos similares; confirme com a listagem):  
  - CSS: `css/style.css` (layout da sidebar, acordeões, legendas, ícones, etc.).  
  - JS principal: `js/script.js` (lógica do mapa, camadas, controles, publicações locais, CSV).  
  - Dados vetoriais: `data/vetor/*.js` (variáveis globais `json_*` com GeoJSON embutido).  
  - CSV: `report/report_bacia_paramirim.csv` (PapaParse).  
  - PDFs locais listados (aba “Trabalhos publicados”).

## Dependências esperadas via CDN (no HTML original)
- **Leaflet 1.9.x**
- **leaflet.draw 1.0.x**
- **leaflet-control-geocoder** (Nominatim)
- **leaflet.locatecontrol**
- **PapaParse 5.x** (CSV)
- **georaster** + **georaster-layer-for-leaflet**
- **Font Awesome** (ícones)

## Funcionalidades principais (comportamento observado/esperado)
1. **Inicialização do mapa**: centro aproximado na região do Rio Paramirim (Bahia), zoom ~8.
2. **Mapas base**: OSM Standard, OSM Humanitário, Esri Satellite, OpenTopoMap.
3. **Camadas temáticas (vetor)**:
   - Bacia do Paramirim (polígono)
   - Rede de drenagem (linhas, estilo por ordem de Strahler)
   - Geomorfologia, Geologia, Solos, Cobertura Vegetal (polígonos com estilos categóricos + legenda)
   - Poços e Rede de Monitoramento (pontos) com `L.divIcon` e popups
   - Uso de **panes** e `z-index` para ordenar a interação
4. **Camadas temáticas (raster)**:
   - Exemplo via **GeoRasterLayer** com `pixelValuesToColorFn` e **legenda em rampa**.
5. **Controles**:
   - **leaflet.draw** (desenho/edição)
   - **Geocoder** (Nominatim)
   - **LocateControl** (geolocalização)
   - **Escala** (`L.control.scale`)
   - **Legenda dinâmica** (DOM próprio atualizado conforme camadas ativas)
6. **Sidebar (acordeões)**:
   - Vetor / Raster
   - Mapas Base
   - **Trabalhos Publicados** (array local; ícone por tipo; botão de download)
   - **Dados da bacia** (CSV via PapaParse)
   - Sobre (texto institucional)

## Dados & Convenções
- **GeoJSON embutido** em arquivos `.js` como variáveis globais (`json_*`), consumidas por `script.js`.
- **Estilos e legendas** acoplados a **atributos específicos** (ex.: `nivel_1` para cobertura vegetal, `classe1`/`litotipo1` para geologia, `nomeug` para geomorfologia, `strah_fina` para drenagem).
- **CSV** com cabeçalhos/linhas interpretados por PapaParse e exibidos como pares “parâmetro → valor”.
- **Publicações locais**: array `{codigo, titulo, tipo, arquivo}` (PDFs em `public/papers/*.pdf` ou equivalente).

---

# Mapeamento → React + React-Leaflet

## Abordagem geral
- **Vite + React 18 + React-Leaflet 4 + Leaflet 1.9+**.
- Componentização: `BaseMap`, `Legend`, `LayerSwitchers`, `VectorLayer`, `RasterLayer`, `DrawControl`, `GeocoderControl`, `LocateControl`.
- **Conversão dos vetores**: substituir `data/vetor/*.js` por `.geojson` (mesmos campos).
- **Legenda** como componente React reativo ao estado global de camadas.
- **Panes**: criar via `useMap()` em `useEffect` e padronizar `zIndex` por tema.

## Bibliotecas recomendadas
- `react`, `react-dom`, `react-router-dom`
- `leaflet`, `react-leaflet`
- `leaflet-draw` (uso imperativo via `useEffect`) ou `react-leaflet-draw` (quando compatível)
- `leaflet-control-geocoder` (uso imperativo)
- `leaflet.locatecontrol` (uso imperativo)
- `papaparse`
- `georaster`, `georaster-layer-for-leaflet`
- `@fortawesome/fontawesome-free` (ou `react-fontawesome`)
- (Opcional) `tailwindcss`

---

# Riscos de migração & mitigação

1. **Plugins sem wrapper React mantido** (geocoder/locate/draw)  
   *Mitigação*: integrar imperativamente com `useMap()` + `useEffect`, garantindo *cleanup*.
2. **GeoJSON definidos como JavaScript global**  
   *Mitigação*: converter para `.geojson`; manter atributos idênticos para as regras de estilo/legenda.
3. **Estilos/legendas acoplados a atributos**  
   *Mitigação*: funções puras `styleFor*` reutilizáveis e testáveis.
4. **Panes e ordem de camadas**  
   *Mitigação*: `ensurePanes(map)` centralizado; documentação do `zIndex` por tema.
5. **Raster (GeoRasterLayer) em ambiente React**  
   *Mitigação*: componente dedicado para adicionar/atualizar/remover a layer; memoizar `pixelValuesToColorFn`.
6. **CSS global do projeto original**  
   *Mitigação*: portar estilos essenciais; isolar em CSS Modules/Tailwind; evitar regressões.
7. **CSV (PapaParse) em SPA**  
   *Mitigação*: paths estáveis em `/public/report/...` ou endpoint; tratar encoding e erros.
8. **Integração com Google Scholar (sem API pública)**  
   *Mitigação*: backend `/api/scholar` (SerpAPI/scraper conforme política) + fallback (Crossref/Semantic Scholar) e cache local (IndexedDB/LocalStorage).

---

# Matriz de equivalência (resumo)
A versão em **CSV** está em `matriz_equivalencia.csv` nesta entrega.

| Recurso atual | Componente/Serviço em React | Biblioteca | Status/Observações |
|---|---|---|---|
| `L.map`, `TileLayer` (OSM, Humanitário, Esri, OTM) | `<MapContainer/>`, `<TileLayer/>`, `BaseMapSwitcher` | react-leaflet / leaflet | Direto; toggles via estado |
| Sidebar (acordeões) | `Sidebar`, `AccordionSection` | React / CSS | Replicar UI/UX e ícones |
| Vetores `data/vetor/*.js` | `VectorLayer` (`<GeoJSON/>`) | react-leaflet | Converter para `.geojson` |
| Estilos temáticos (polígonos) | `styleFor*` + `<GeoJSON style/>` | React | Regras 1:1 |
| Drenagem (Strahler) | `VectorLayer` (lines) + `styleForDrenagem` | react-leaflet | Peso/cor por ordem |
| Pontos (poços/rede) | `VectorPointLayer` + `DivIcon` | react-leaflet / leaflet | `pointToLayer` + FA |
| Popups | `<GeoJSON onEachFeature/>` | react-leaflet | Conteúdo HTML |
| Panes/z-index | `ensurePanes(map)` | leaflet | z-index por tema |
| Legenda dinâmica | `<Legend/>` | React | Reativo a camadas ativas |
| Desenho/edição | `DrawControl` | leaflet.draw | Uso imperativo |
| Geocoder | `GeocoderControl` | leaflet-control-geocoder | Uso imperativo |
| Locate | `LocateControl` | leaflet.locatecontrol | Uso imperativo |
| Escala | `<ScaleControl/>` | leaflet | `L.control.scale()` |
| Raster | `RasterLayer` | georaster-layer-for-leaflet | Função de cores |
| Basemap Switcher | `BaseMapSwitcher` | React | Reativo |
| CSV da bacia | `useBaciaCSV()` | papaparse | Hook para leitura |
| Publicações locais | `PublicationsLocal` | React | Lista PDF/links |
| Publicações (Scholar) | `searchScholar` + fallbacks | fetch + backend | Requer backend/fallback |
| Ícones | FA | @fortawesome | Consistência |
| A11y/Responsivo | Semântico + ARIA | React/CSS | Teclado/leitores |
