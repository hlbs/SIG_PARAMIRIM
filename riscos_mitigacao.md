# Riscos de migração e mitigação — SIG PARAMIRIM

1. **Compatibilidade de plugins Leaflet em React**
   - **Risco:** ausência de wrappers oficiais/atualizados para `leaflet-draw`, `leaflet-control-geocoder`, `leaflet.locatecontrol`.
   - **Mitigação:** integração imperativa com `useMap()` e `useEffect`, controle completo do ciclo de vida e *cleanup* ao desmontar componentes.

2. **Conversão de dados vetoriais (`.js` → `.geojson`)**
   - **Risco:** perda de atributos necessários para estilos/legendas.
   - **Mitigação:** manter campos originais; criar testes rápidos de validação de atributos por camada antes de ligar a legenda.

3. **Estilos e legendas acoplados a atributos específicos**
   - **Risco:** discrepâncias visuais se atributos mudarem.
   - **Mitigação:** encapsular regras em funções puras `styleFor*`, com tabela de cores centralizada e *unit tests* simples.

4. **Ordem de camadas e panes**
   - **Risco:** interações incorretas (popups por baixo, polígonos acima de pontos, etc.).
   - **Mitigação:** `ensurePanes(map)` com `zIndex` padronizado e documentação por tema.

5. **Camadas raster (GeoRasterLayer) com função de cores**
   - **Risco:** performance em dispositivos modestos.
   - **Mitigação:** memoização da função de cores, *throttling* de updates e opção de desativar raster por padrão.

6. **CSS global e regressões de layout**
   - **Risco:** conflitos de estilos ou quebra de responsividade.
   - **Mitigação:** portar apenas o essencial; preferir CSS Modules ou Tailwind; revisar com Lighthouse/DevTools.

7. **Leitura de CSV (PapaParse) e encoding**
   - **Risco:** problemas de acentuação/encoding em produção.
   - **Mitigação:** garantir UTF-8, cabeçalhos consistentes; oferecer fallback via endpoint JSON.

8. **Integração com Google Scholar**
   - **Risco:** não há API pública; políticas de uso.
   - **Mitigação:** backend com SerpAPI/scraper legal; **fallback** Crossref/Semantic Scholar; cache local (24h) e transparência da fonte exibida na UI.

9. **Acessibilidade e Internacionalização**
   - **Risco:** navegação por teclado inadequada; leitores de tela.
   - **Mitigação:** ARIA, foco gerenciado, textos alternativos, i18n (pt-BR) desde o início.

10. **Desempenho e *code splitting***
    - **Risco:** bundle grande e tempo de carregamento alto.
    - **Mitigação:** lazy loading de páginas e camadas pesadas; *tree-shaking*; imagens e GIFs otimizados.
