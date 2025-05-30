document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM Carregado. Iniciando script.js para Boquira Consciente (BUQCons)...");

    // Verifica se as bibliotecas principais foram carregadas
    if (typeof L !== 'undefined' && L.version) {
        console.log("Versão do Leaflet carregada:", L.version);
    } else {
        console.error("Leaflet (L) não está definido! Verifique o carregamento da biblioteca Leaflet no index.html.");
        const mapDivError = document.getElementById('map');
        if (mapDivError) mapDivError.innerHTML = "<p style='padding:20px; text-align:center; color:red; font-weight:bold;'>ERRO CRÍTICO: A biblioteca principal do mapa (Leaflet) não pôde ser carregada.</p>";
        return;
    }

    // Verifica plugins após um pequeno atraso para dar chance de carregarem
    setTimeout(() => {
        if (typeof Papa === 'undefined') console.error("PapaParse não carregado! Funcionalidade de CSV da bacia não funcionará.");

        if (typeof L.Control.Draw === 'undefined') {
            console.error("Leaflet.Draw não carregado! Ferramenta de medição/desenho não funcionará.");
        } else {
            console.log("Leaflet.Draw parece estar carregado.");
        }

        // VERIFICAÇÃO CORRIGIDA PARA BIBLIOTECAS RASTER
        if (typeof parseGeoraster !== 'function' || typeof GeoRasterLayer !== 'function') {
            console.error("ERRO DE CARREGAMENTO: 'parseGeoraster' ou 'GeoRasterLayer' não estão definidos. Camadas Raster não funcionarão. Verifique os links CDN no index.html e se não há erros na aba 'Network' do console (F12).");
        } else {
            console.log("Bibliotecas 'parseGeoraster' e 'GeoRasterLayer' parecem estar carregadas.");
        }
    }, 350);


    const initialLat = -13.3;
    const initialLng = -42.5;
    const initialZoom = 8;
    let map;

    try {
        map = L.map('map', {
            center: [initialLat, initialLng],
            zoom: initialZoom,
            zoomControl: true,
            preferCanvas: true
        });
        map.zoomControl.setPosition('topright');
        console.log("Mapa Leaflet inicializado.");
    } catch (e) {
        console.error("Erro CRÍTICO ao inicializar o mapa Leaflet:", e);
        const mapDivError = document.getElementById('map');
        if (mapDivError) mapDivError.innerHTML = "<p style='padding:20px; text-align:center; color:red; font-weight:bold;'>Falha ao carregar o mapa.</p>";
        return;
    }

    // CAMADAS BASE
    const baseLayersData = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }),
        hot: L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { attribution: '&copy; OSM, HOT' }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri' }),
        topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenTopoMap' })
    };
    let currentBaseLayer = baseLayersData.osm;
    currentBaseLayer.addTo(map);
    console.log("Camada base padrão (OSM) adicionada.");

    // SIDEBAR - ACORDEÃO
    window.baciaDataLoaded = false;
    document.querySelectorAll('.section-toggle-button').forEach(button => {
        const sectionContent = button.nextElementSibling;
        const icon = button.querySelector('.toggle-icon');
        const isActive = button.classList.contains('active');

        if (sectionContent) sectionContent.style.display = isActive ? "block" : "none";
        if (icon) {
            icon.classList.toggle('fa-chevron-up', isActive);
            icon.classList.toggle('fa-chevron-down', !isActive);
        }
        if (isActive && sectionContent && sectionContent.id === 'bacia-info-panel' && typeof carregarDadosBacia === 'function' && !window.baciaDataLoaded) {
            carregarDadosBacia();
        }

        button.addEventListener('click', () => {
            const currentlyActive = button.classList.toggle('active');
            if (sectionContent) sectionContent.style.display = currentlyActive ? "block" : "none";
            if (icon) {
                icon.classList.toggle('fa-chevron-up', currentlyActive);
                icon.classList.toggle('fa-chevron-down', !currentlyActive);
            }
            if (currentlyActive && sectionContent.id === 'bacia-info-panel' && typeof carregarDadosBacia === 'function' && !window.baciaDataLoaded) {
                carregarDadosBacia();
            }
        });
    });
    console.log("Funcionalidade acordeão da sidebar configurada.");

    // CUSTOM BASEMAP SWITCHER
    const basemapButtons = document.querySelectorAll('#custom-basemap-switcher .basemap-button');
    if (basemapButtons.length > 0) {
        basemapButtons.forEach(button => {
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                const layerKey = this.getAttribute('data-layerkey');
                const selectedLayer = baseLayersData[layerKey];
                if (selectedLayer && selectedLayer !== currentBaseLayer) {
                    if (map.hasLayer(currentBaseLayer)) map.removeLayer(currentBaseLayer);
                    map.addLayer(selectedLayer); currentBaseLayer = selectedLayer;
                    basemapButtons.forEach(btn => btn.classList.remove('active'));
                    this.classList.add('active');
                    console.log("Camada base alterada para:", layerKey);
                }
            });
        });
    } else { console.warn("Botões do seletor de mapa base customizado não encontrados."); }

    // TRABALHOS PUBLICADOS
    const documentos = [
        { codigo: "01", titulo: "Atlas Geoquímico da Bacia do Rio Paramirim BA", tipo: "pdf", arquivo: "01_Atlas_Geoquímico_da_Bacia_do_Rio_Paramirim_BA.pdf" },
        { codigo: "02", titulo: "Carta Geológica Boquira BA", tipo: "pdf", arquivo: "02_Carta_Geológica_Boquira_BA.pdf" },
        { codigo: "03", titulo: "Impactos Ambientais nos Recursos Hídricos por Metais Tóxicos: O Caso do Município de Boquira, no Semiárido Baiano", tipo: "pdf", arquivo: "03_Impactos_Ambientais_nos_Recursos_Hídricos_por_Metais_Tóxicos_O_Caso_do_Município_de_Boquira,_no_Semiárido_Baiano.pdf" },
        { codigo: "04", titulo: "Predição e Espacialização de Elementos Potencialmente Tóxicos em Solos no Entorno de Pilha de Rejeito de Mineração: Riscos à Saúde Humana e Fitorremediação", tipo: "pdf", arquivo: "04_Predição_e_Espacialização_de_Elementos_Potencialmente_Tóxicos_em_Solos_no_Entorno_de_Pilha_de_Rejeito_de_Mineração_Riscos_à_Saúde_Humana_e_Fitorremediação.pdf" },
        { codigo: "05", titulo: "Estudos Geoquímicos no Município de Boquira Estado da Bahia", tipo: "pdf", arquivo: "05_Estudos_Geoquímicos_no_Município_de_Boquira_Estado_da_Bahia.pdf" },
        { codigo: "06", titulo: "Alternativa Locacional para Implantação de Aterro Sanitário de Pequeno Porte no Município de Boquira BA", tipo: "pdf", arquivo: "06_Alternativa_Locacional_para_Implantação_de_Aterro_Sanitário_de_Pequeno_Porte_no_Município_de_Boquira_BA.pdf" }
    ];
    const listaDocumentosDiv = document.getElementById('documentos-lista');
    function getIconForFileType(fileType) {
        switch (fileType.toLowerCase()) {
            case 'pdf': return 'fas fa-file-pdf';
            case 'docx': case 'doc': return 'fas fa-file-word';
            default: return 'fas fa-file-alt';
        }
    }
    if (listaDocumentosDiv) {
        if (documentos.length > 0) {
            listaDocumentosDiv.innerHTML = '';
            documentos.forEach(doc => {
                const item = document.createElement('div'); item.className = 'documento-item';
                const iconClass = getIconForFileType(doc.tipo);
                item.innerHTML = `<i class="${iconClass} doc-icon"></i><div class="doc-info"><span class="doc-code">Ref: ${doc.codigo}</span><span class="doc-title" title="${doc.titulo}">${doc.titulo}</span></div><a href="documentos/${doc.arquivo}" download="${doc.arquivo}" class="download-link" title="Baixar ${doc.titulo}"><i class="fas fa-download"></i></a>`;
                listaDocumentosDiv.appendChild(item);
            });
        } else { listaDocumentosDiv.innerHTML = '<p>Nenhum trabalho publicado.</p>'; }
    } else { console.error("Elemento #documentos-lista não encontrado."); }

    // INFORMAÇÕES DA BACIA
    const dadosBaciaConteudo = document.getElementById('dados-bacia-conteudo');
    // window.baciaDataLoaded já definido acima
    function carregarDadosBacia() {
        const filePath = 'report/report_bacia_paramirim.csv';
        console.log("Carregando CSV da bacia:", filePath);
        if (!dadosBaciaConteudo) { console.error("#dados-bacia-conteudo não encontrado."); return; }
        dadosBaciaConteudo.innerHTML = '<p><em><i class="fas fa-spinner fa-spin"></i> Carregando...</em></p>';

        if (typeof Papa === 'undefined') {
            console.error("Biblioteca PapaParse não carregada. Não é possível ler o CSV.");
            dadosBaciaConteudo.innerHTML = '<p>Erro: Biblioteca de leitura de CSV não carregada.</p>';
            return;
        }

        Papa.parse(filePath, {
            download: true, header: true, skipEmptyLines: true, encoding: "UTF-8",
            transformHeader: h => h.trim(),
            complete: function (results) {
                console.log("PapaParse Resultados:", results);
                if (results.data && results.data.length > 0) {
                    window.baciaDataLoaded = true; dadosBaciaConteudo.innerHTML = ''; let itemsAdded = 0;
                    results.data.forEach(item => {
                        const parametro = item.Parameter, valor = item.Value, unidade = item.Unit, interpretacao = item.Interpretation;
                        if (parametro && typeof parametro === 'string' && parametro.trim() !== "" && typeof valor !== 'undefined') {
                            const p = document.createElement('p'); let valorDisplay = String(valor).trim();
                            let unidadeDisplay = "";
                            if (unidade && typeof unidade === 'string' && String(unidade).trim() !== "" && String(unidade).toLowerCase() !== "nan") {
                                unidadeDisplay = String(unidade).trim().replace(/km\?|km\ufffd/g, 'km²').replace(/m\?|m\ufffd/g, 'm²');
                                if (unidadeDisplay) valorDisplay += ` ${unidadeDisplay}`;
                            }
                            p.innerHTML = `<strong>${String(parametro).trim()}:</strong> ${valorDisplay}`;
                            dadosBaciaConteudo.appendChild(p); itemsAdded++;
                            if (interpretacao && typeof interpretacao === 'string' && String(interpretacao).trim() !== "" && String(interpretacao).toLowerCase() !== "nan") {
                                const span = document.createElement('span'); span.style.cssText = 'font-size:0.9em; font-style:italic; display:block; margin-left:15px;';
                                span.textContent = String(interpretacao).trim(); p.appendChild(span);
                            }
                        }
                    });
                    if (itemsAdded === 0) dadosBaciaConteudo.innerHTML = `<p>Dados lidos, mas formato inesperado. Verifique colunas 'Parameter'/'Value' e codificação UTF-8 do CSV: <code>${filePath}</code></p>`;
                    else console.log(itemsAdded + " itens da bacia adicionados.");
                } else {
                    dadosBaciaConteudo.innerHTML = `<p>Nenhum dado encontrado ou arquivo CSV vazio: <code>${filePath}</code>.</p>`;
                    if (results.errors && results.errors.length > 0) {
                        console.error("PapaParse Erros:", results.errors);
                        results.errors.forEach(err => dadosBaciaConteudo.innerHTML += `<p><small>Erro CSV: ${err.message}</small></p>`);
                    }
                }
            },
            error: function (err) {
                console.error("PapaParse Erro Crítico:", err);
                dadosBaciaConteudo.innerHTML = `<p>Erro ao carregar CSV: <code>${filePath}</code>. ${err.message}. Verifique se está em servidor web local.</p>`;
            }
        });
    }

    // -------------------------------------------------------------------------
    // GERENCIAMENTO DE CAMADAS TEMÁTICAS
    // -------------------------------------------------------------------------
    const activeThematicLayers = {};
    const layerOrder = [];
    const legendContainer = document.getElementById('legend-container');
    const vectorListDiv = document.getElementById('vector-layers-list');
    const rasterListDiv = document.getElementById('raster-layers-list');
    const rasterLoadingIndicator = document.getElementById('raster-loading-indicator');

    if (!vectorListDiv || !rasterListDiv) {
        console.error("Elementos #vector-layers-list ou #raster-layers-list não encontrados no DOM!");
    } else {
        vectorListDiv.innerHTML = '';
        rasterListDiv.innerHTML = '';
    }
    if (legendContainer) {
        legendContainer.innerHTML = '<h4>Legendas Ativas</h4>';
        legendContainer.style.display = 'none';
    }
    if (!rasterLoadingIndicator) console.error("#raster-loading-indicator não encontrado");


    const layersConfig = [
        // --- CAMADAS VETORIAIS ---
        {
            id: 'aquifero', title: 'Aquíferos 1:1.000.000', type: 'vector', varName: 'json_aquifero_1_1000000_sirgas2000_5', icon: 'fas fa-water', visible: false,
            styleFn: function (feature) {
                const classe = feature.properties.classe;
                let color = '#E0E0E0'; // Cinza claro para "Outro"
                if (classe === 'Cristalino') color = '#a6cee3'; // Azul claro
                else if (classe === 'Granular') color = '#b2df8a'; // Verde claro
                else if (classe === 'Metasedimentar') color = '#fb9a99'; // Rosa/Salmão
                return { fillColor: color, weight: 1, opacity: 1, color: '#424242', fillOpacity: 0.65 };
            },
            onEachFeatureFn: function (feature, layer) {
                let p = feature.properties;
                let popupContent = `<strong>Aquífero</strong><br>
                                    Classe: ${p.classe || 'N/D'}<br>
                                    Zonas: ${p.zonas || 'N/D'}<br>
                                    Sigla: ${p.sigla || 'N/D'}`;
                layer.bindPopup(popupContent);
            },
            legendFn: function () {
                return [
                    { color: '#a6cee3', label: 'Cristalino' }, { color: '#b2df8a', label: 'Granular' },
                    { color: '#fb9a99', label: 'Metasedimentar' }
                ];
            }
        },
        {
            id: 'bacia_paramirim', title: 'Bacia Hidrográfica do Rio Paramirim', type: 'vector', varName: 'json_bacia_do_rio_paramirim_sirgas2000_utm23s_0', icon: 'fas fa-draw-polygon', visible: true,
            styleFn: function () { return { fillColor: "#5dade2", color: "#2e86c1", weight: 2.5, fillOpacity: 0.25 }; },
            onEachFeatureFn: function (f, l) { l.bindPopup("<strong>Bacia Hidrográfica do Rio Paramirim</strong>"); },
            legendFn: function () { return [{ color: '#5dade2', label: 'Bacia do Paramirim', opacity: 0.25 }]; }
        },
        { 
            id: 'cobertura_vegetal', 
            title: 'Cobertura Vegetal 1:50.000', // Título ajustado para refletir a nova classificação
            type: 'vector', 
            varName: 'json_cobertura_vegetal_1_50000_sirgas2000_3', 
            icon: 'fas fa-seedling', 
            visible: false,
            styleFn: function(feature) {
                // Usando 'nivel_1' como base para a classificação da sua legenda
                const classeNivel1 = feature.properties.nivel_1; 
                let color = '#E0E0E0'; // Cinza claro para "Outros/Não Classificado"

                if (classeNivel1) { 
                    const lowerClasse = String(classeNivel1).toLowerCase();
                    
                    // Mapeie os valores do seu atributo nivel_1 para as classes da sua legenda
                    // Os textos aqui precisam corresponder aos valores no seu GeoJSON!
                    if (lowerClasse.includes('antropizada') || lowerClasse.includes('agropecuária') || lowerClasse.includes('urbana') || lowerClasse.includes('mosaico')) {
                        color = '#FFC0CB'; // Rosa claro (para Áreas Antropizadas)
                    } else if (lowerClasse.includes('savana estépica') || lowerClasse.includes('caatinga')) { 
                        color = '#F4A460'; // SandyBrown (para Caatinga)
                    } else if (lowerClasse.includes('campestre') && lowerClasse.includes('rupestre')) { // Ex: "Formação Campestre Rupestre"
                        color = '#98FB98'; // PaleGreen (para Campo Rupestre)
                    } else if (lowerClasse.includes('campestre')) { // Para outras formações campestres
                        color = '#90EE90'; // LightGreen
                    } else if (lowerClasse.includes('cerrado') || lowerClasse.includes('savânica')) { 
                        color = '#FFD700'; // Gold (para Cerrado)
                    } else if (lowerClasse.includes('florestal') || lowerClasse.includes('floresta estacional')) { 
                        color = '#228B22'; // ForestGreen
                    } else if (lowerClasse.includes('água') || lowerClasse.includes('corpo dágua')) {
                        color = '#ADD8E6'; // LightBlue
                    } else if (lowerClasse.includes('fluvial') || lowerClasse.includes('lacustre') || lowerClasse.includes('vereda') || lowerClasse.includes('palmeiral')) { 
                        color = '#AFEEEE'; // PaleTurquoise (para Veg. Influência Fluvial/Lacustre)
                    }
                }
                return { fillColor: color, weight: 0.5, color: '#424242', fillOpacity: 0.75 };
            },
            onEachFeatureFn: function(f,l){ 
                let popupContent = `<strong>Cobertura Vegetal</strong><br>
                                    Classificação (Nível 1): ${f.properties.nivel_1 || 'N/D'}`;
                // Opcional: mostrar outros níveis se existirem e forem relevantes
                if (f.properties.nivel_2 && String(f.properties.nivel_2).trim() !== '') {
                    popupContent += `<br><small>Nível 2: ${f.properties.nivel_2}</small>`;
                }
                if (f.properties.nivel_3 && String(f.properties.nivel_3).trim() !== '') {
                    popupContent += `<br><small>Nível 3: ${f.properties.nivel_3}</small>`;
                }
                l.bindPopup(popupContent);
            },
            legendFn: function() {
                // Legenda baseada nas classes da sua imagem
                return [
                    { color: '#FFC0CB', label: 'Áreas Antropizadas' },
                    { color: '#F4A460', label: 'Caatinga' },
                    { color: '#98FB98', label: 'Campo Rupestre' }, // Cor exemplo
                    { color: '#FFD700', label: 'Cerrado' },
                    { color: '#228B22', label: 'Floresta Estacional' },
                    { color: '#ADD8E6', label: 'Corpos D\'água' },
                    { color: '#AFEEEE', label: 'Veg. Influência Fluvial/Lacustre' },
                    { color: '#E0E0E0', label: 'Outros/Não Classificado' }
                ];
            }
        },
        {
            id: 'geologia', title: 'Geologia 1:1.000.000', type: 'vector', varName: 'json_geologia_1_1000000_sirgas2000_1', icon: 'fas fa-gem', visible: false,
            styleFn: function (feature) {
                const classe = feature.properties.classe1 || "Indefinida";
                let color = '#9e9e9e'; // Cinza para Indefinida
                if (classe.includes('Sedimentar')) color = '#ffc107'; // Ambar
                else if (classe.includes('Metamórfica')) color = '#ff7043'; // Laranja profundo
                else if (classe.includes('Ígnea')) color = '#ef5350'; // Vermelho
                else if (classe.includes('Depósitos')) color = '#fff59d'; // Amarelo claro para depósitos
                return { fillColor: color, weight: 1, color: '#424242', fillOpacity: 0.6 };
            },
            onEachFeatureFn: function (f, l) { l.bindPopup(`<strong>Geologia</strong><br>Unidade: ${f.properties.nome_unida || 'N/D'}<br>Classe: ${f.properties.classe1 || 'N/D'}<br>Litotipo: ${f.properties.litotipo1 || 'N/D'}`); },
            legendFn: function () {
                return [
                    { color: '#ffc107', label: 'Sedimentar' }, { color: '#ff7043', label: 'Metamórfica' },
                    { color: '#ef5350', label: 'Ígnea' }, { color: '#fff59d', label: 'Depósitos Recentes' },
                    { color: '#9e9e9e', label: 'Indefinida/Outra' }
                ];
            }
        },
        {
            id: 'geomorfologia', title: 'Geomorfologia 1:1.000.000', type: 'vector', varName: 'json_geomorfologia_1_1000000_sirgas2000_2', icon: 'fas fa-mountain', visible: false,
            styleFn: function (feature) {
                const nomeug = feature.properties.nomeug || "Outros";
                let color = '#E0E0E0';
                if (nomeug.includes('Planaltos')) color = '#BCAAA4'; // Marrom claro
                else if (nomeug.includes('Depressões')) color = '#D7CCC8'; // Cinza terroso
                else if (nomeug.includes('Chapadas')) color = '#A1887F'; // Marrom médio
                else if (nomeug.includes('Pedimentos')) color = '#EFEBE9'; // Bege
                else if (nomeug.includes('Planícies')) color = '#FFF9C4'; // Amarelo pálido
                return { fillColor: color, weight: 1, color: '#5D4037', fillOpacity: 0.7 };
            },
            onEachFeatureFn: function (f, l) { l.bindPopup(`<strong>Geomorfologia</strong><br>Unidade: ${f.properties.nomeug || 'N/D'}`); },
            legendFn: function () {
                return [
                    { color: '#A1887F', label: 'Planaltos' }, { color: '#D7CCC8', label: 'Depressões' },
                    { color: '#8D6E63', label: 'Chapadas' }, { color: '#EFEBE9', label: 'Pedimentos' },
                    { color: '#FFF9C4', label: 'Planícies' }, { color: '#E0E0E0', label: 'Outros' }
                ];
            }
        },
        {
            id: 'pocos', title: 'Poços SIAGAS', type: 'vector', varName: 'json_pocos_bacia_paramirim_sirgas2000_8', icon: 'fas fa-circle-dot', visible: false,
            pointToLayerFn: function (f, latlng) {
                let fillColor = '#2979FF'; // Azul vibrante
                const vazao = parseFloat(String(f.properties.vazao_esta).replace(',', '.'));
                if (!isNaN(vazao)) {
                    if (vazao < 1) fillColor = '#81D4FA'; // Azul muito claro
                    else if (vazao < 5) fillColor = '#29B6F6'; // Azul claro
                    else if (vazao > 20) fillColor = '#01579B'; // Azul escuro
                }
                return L.circleMarker(latlng, { radius: 5, fillColor: fillColor, color: "#000", weight: 0.5, opacity: 1, fillOpacity: 0.9 });
            },
            onEachFeatureFn: function (f, l) { l.bindPopup(`<strong>Poço SIAGAS</strong><br>Local: ${f.properties.str_local_ || 'N/D'}<br>Natureza: ${f.properties.natureza_p || 'N/D'}<br>Vazão: ${f.properties.vazao_esta || 'N/D'} L/s`); },
            legendFn: function () {
                return [
                    { color: '#01579B', label: 'Poço Alta Vazão (>20 L/s)', isPoint: true },
                    { color: '#2979FF', label: 'Poço Média Vazão (5-20 L/s)', isPoint: true },
                    { color: '#29B6F6', label: 'Poço Baixa Vazão (1-5 L/s)', isPoint: true },
                    { color: '#81D4FA', label: 'Poço Vazão Mínima (<1 L/s)', isPoint: true }
                ];
            }
        },
        {
            id: 'drenagem', title: 'Rede de Drenagem', type: 'vector', varName: 'json_rede_de_drenagem_bacia_paramirim_sirgas2000_utm23s_7', icon: 'fas fa-water', visible: false,
            styleFn: function (feature) {
                const strahler = parseInt(feature.properties.strah_fina);
                let weight = 1; let color = '#64B5F6'; // Azul claro para rios menores
                if (strahler === 2) { weight = 1.5; color = '#42A5F5'; }
                else if (strahler === 3) { weight = 2.5; color = '#1E88E5'; }
                else if (strahler == 4) { weight = 3.5; color = '#0D47A1'; } // Azul escuro para maiores
                return { color: color, weight: weight, opacity: 0.9 };
            },
            onEachFeatureFn: function (f, l) { l.bindPopup(`<strong>Drenagem</strong><br>Ordem Strahler: ${f.properties.strah_fina || 'N/D'}`); },
            legendFn: function () {
                return [
                    { type: 'line', style: { color: "#0D47A1", weight: 3.5 }, label: 'Drenagem (ordem 4)' },
                    { type: 'line', style: { color: "#1E88E5", weight: 2.5 }, label: 'Drenagem (ordem 3)' },
                    { type: 'line', style: { color: "#42A5F5", weight: 1.5 }, label: 'Drenagem (ordem 2)' },
                    { type: 'line', style: { color: "#64B5F6", weight: 1 }, label: 'Drenagem (ordem 1)' }
                ];
            }
        },
        {
            id: 'qualidade_agua', title: 'Rede Monitoramento Água', type: 'vector', varName: 'json_rede_monitoramento_qualidade_da_agua_sirgas2000_6', icon: 'fas fa-vial-circle-check', visible: false,
            pointToLayerFn: function (f, latlng) {
                return L.marker(latlng, {
                    icon: L.divIcon({
                        className: 'custom-div-icon',
                        html: '<i class="fas fa-flask-vial" style="color: #C62828; font-size:20px;"></i>',
                        iconSize: [20, 20], iconAnchor: [10, 20]
                    })
                });
            },
            onEachFeatureFn: function (f, l) { l.bindPopup(`<strong>Monitoramento Água (INEMA)</strong><br>Código: ${f.properties.código || 'N/D'}<br>Rio: ${f.properties.rio || 'N/D'}<br>Município: ${f.properties.município || 'N/D'}`); },
            legendFn: function () { return [{ type: 'icon', iconClass: 'fas fa-flask-vial', color: '#C62828', label: 'Ponto Monitoramento Água' }]; }
        },
        {
            id: 'solos', title: 'Solos 1:1.000.000', type: 'vector', varName: 'json_solo_1_1000000_sirgas2000_4', icon: 'fas fa-mound', visible: false,
            styleFn: function (feature) {
                const classe = feature.properties.classeperh || "Outro";
                let color = '#D7CCC8'; // Cinza terroso padrão
                if (classe.includes('LATOSSOLO')) color = '#A1887F';
                else if (classe.includes('ARGISSOLO')) color = '#BCAAA4';
                else if (classe.includes('NEOSSOLO')) color = '#EFEBE9';
                else if (classe.includes('CAMBISSOLO')) color = '#FFCCBC';
                else if (classe.includes('GLEISSOLO')) color = '#B0BEC5'; // Cinza azulado para Gleissolo
                else if (classe.includes('PLANOSSOLO')) color = '#CFD8DC'; // Cinza claro
                return { fillColor: color, weight: 1, color: '#5D4037', fillOpacity: 0.7 };
            },
            onEachFeatureFn: function (f, l) { l.bindPopup(`<strong>Solo</strong><br>Classe: ${f.properties.classeperh || 'N/D'}<br>Potencial: ${f.properties.potencial || 'N/D'}`); },
            legendFn: function () {
                return [
                    { color: '#A1887F', label: 'Latossolo' }, { color: '#BCAAA4', label: 'Argissolo' },
                    { color: '#EFEBE9', label: 'Neossolo' }, { color: '#FFCCBC', label: 'Cambissolo' },
                    { color: '#B0BEC5', label: 'Gleissolo' }, { color: '#CFD8DC', label: 'Planossolo' },
                    { color: '#D7CCC8', label: 'Outro Solo' }
                ];
            }
        },
        // --- CAMADAS RASTER ---
        {
            id: 'mde', title: 'Modelo Digital de Elevação', type: 'raster', filePath: 'data/raster/mde_sirgas2000.tif', icon: 'fas fa-chart-area', visible: false,
            rasterOptions: {
                band: 0,
                pixelValuesToColorFn: function (values) {
                    const v = values[0];
                    if (v === undefined || v === null || v <= 0) return null; // Transparente para <= 0 ou NoData
                    if (v < 300) return '#2c7bb6'; if (v < 500) return '#abd9e9';
                    if (v < 700) return '#ffffbf'; if (v < 900) return '#fee090';
                    if (v < 1200) return '#fdae61'; if (v < 1500) return '#f46d43';
                    return '#d73027';
                }
            },
            legendFn: function () {
                return {
                    type: 'raster_ramp', title: 'MDE (m)',
                    colors: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027'],
                    labels: ['>0-300', '500', '700', '900', '1200', '1500', '>1500m']
                };
            }
        },
        {
            id: 'ghi', title: 'Irradiação Global Horizontal', type: 'raster', filePath: 'data/raster/ghi_sirgas2000.tif', icon: 'fas fa-sun', visible: false,
            rasterOptions: {
                band: 0,
                pixelValuesToColorFn: function (values) {
                    const v = values[0];
                    if (v === undefined || v === null || v <= 0) return null;
                    if (v < 3) return '#ffffd4'; if (v < 4) return '#fee391';
                    if (v < 5) return '#fec44f'; if (v < 6) return '#fe9929';
                    if (v < 7) return '#ec7014'; if (v < 8) return '#cc4c02';
                    return '#8c2d04';
                }
            },
            legendFn: function () {
                return {
                    type: 'raster_ramp', title: 'GHI (kWh/m².dia)',
                    colors: ['#ffffd4', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'],
                    labels: ['>0-3', '4', '5', '6', '7', '8', '>8']
                };
            }
        },
        {
            id: 'vento', title: 'Velocidade do Vento (200m)', type: 'raster', filePath: 'data/raster/wind_200m_sirgas2000.tif', icon: 'fas fa-wind', visible: false,
            rasterOptions: {
                band: 0,
                pixelValuesToColorFn: function (values) {
                    const v = values[0];
                    if (v === undefined || v === null || v <= 0) return null;
                    if (v < 2) return '#f7fbff'; if (v < 4) return '#deebf7';
                    if (v < 6) return '#c6dbef'; if (v < 8) return '#9ecae1';
                    if (v < 10) return '#6baed6'; if (v < 12) return '#3182bd';
                    return '#08519c';
                }
            },
            legendFn: function () {
                return {
                    type: 'raster_ramp', title: 'Vento a 200m (m/s)',
                    colors: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'],
                    labels: ['>0-2', '4', '6', '8', '10', '12', '>12']
                };
            }
        },
    ];

    // Criação de Panes para ordenação
    map.createPane('rasterThemePane'); map.getPane('rasterThemePane').style.zIndex = 250;
    map.createPane('vectorThemePolygonsPane'); map.getPane('vectorThemePolygonsPane').style.zIndex = 300;
    map.createPane('vectorThemeLinesPane'); map.getPane('vectorThemeLinesPane').style.zIndex = 350;
    map.createPane('vectorThemePointsPane'); map.getPane('vectorThemePointsPane').style.zIndex = 400;
    map.createPane('drawnItemsPane'); map.getPane('drawnItemsPane').style.zIndex = 450; // Camadas desenhadas acima das temáticas


    function getVectorPaneName(geojsonData) {
        if (geojsonData && geojsonData.features && geojsonData.features.length > 0) {
            const firstFeature = geojsonData.features[0];
            if (firstFeature && firstFeature.geometry && firstFeature.geometry.type) {
                const geomType = firstFeature.geometry.type;
                if (geomType.includes('Point') || geomType.includes('MultiPoint')) return 'vectorThemePointsPane';
                if (geomType.includes('LineString') || geomType.includes('MultiLineString')) return 'vectorThemeLinesPane';
                if (geomType.includes('Polygon') || geomType.includes('MultiPolygon')) return 'vectorThemePolygonsPane';
            }
        }
        return 'vectorThemePolygonsPane';
    }

    async function loadAndAddLayer(layerConfig, initialLoad = false) {
        let leafletLayer;
        const paneName = layerConfig.type === 'raster' ? 'rasterThemePane' : getVectorPaneName(window[layerConfig.varName]);

        if (layerConfig.type === 'vector') {
            if (typeof window[layerConfig.varName] === 'undefined') {
                console.warn(`Variável GeoJSON ${layerConfig.varName} não encontrada para ${layerConfig.title}.`);
                return null;
            }
            const geojsonData = window[layerConfig.varName];
            leafletLayer = L.geoJSON(geojsonData, {
                style: layerConfig.styleFn,
                onEachFeature: layerConfig.onEachFeatureFn,
                pointToLayer: layerConfig.pointToLayerFn,
                pane: paneName
            });
        } else if (layerConfig.type === 'raster') {
            if (typeof parseGeoraster !== 'function' || typeof GeoRasterLayer !== 'function') {
                console.error("Bibliotecas raster não carregadas para:", layerConfig.title);
                if (rasterLoadingIndicator) rasterLoadingIndicator.style.display = 'none';
                return null;
            }
            if (rasterLoadingIndicator) rasterLoadingIndicator.style.display = 'block';
            try {
                const response = await fetch(layerConfig.filePath);
                if (!response.ok) throw new Error(`Falha HTTP: ${response.status}`);
                const arrayBuffer = await response.arrayBuffer();
                const parsedGeoraster = await parseGeoraster(arrayBuffer);

                const options = {
                    georaster: parsedGeoraster, opacity: 0.75,
                    resolution: map.getZoom() < 9 ? 256 : (map.getZoom() < 11 ? 128 : 64),
                    pane: paneName,
                    ...(layerConfig.rasterOptions || {})
                };
                leafletLayer = new GeoRasterLayer(options);
            } catch (error) {
                console.error(`Erro raster ${layerConfig.title}:`, error);
                const chkElement = document.getElementById(`chk-${layerConfig.id}`);
                if (chkElement && chkElement.parentElement) chkElement.parentElement.style.color = 'red';
                if (rasterLoadingIndicator) rasterLoadingIndicator.style.display = 'none';
                return null;
            } finally {
                // Atraso pequeno para o indicador não sumir rápido demais se o raster for pequeno
                setTimeout(() => {
                    if (rasterLoadingIndicator) rasterLoadingIndicator.style.display = 'none';
                }, 300);
            }
        }

        if (leafletLayer) {
            activeThematicLayers[layerConfig.id] = {
                instance: leafletLayer, config: layerConfig,
                visible: layerConfig.visible && initialLoad,
            };
            if (layerConfig.visible && initialLoad) {
                if (!map.hasLayer(leafletLayer)) map.addLayer(leafletLayer);
            }
        }
        return leafletLayer;
    }

    function toggleLayerVisibility(layerId, isVisible) {
        const layerEntry = activeThematicLayers[layerId];

        if (layerEntry && layerEntry.instance) {
            if (isVisible) {
                if (!map.hasLayer(layerEntry.instance)) {
                    const paneName = layerEntry.config.type === 'raster' ? 'rasterThemePane' : getVectorPaneName(window[layerEntry.config.varName]);
                    if (layerEntry.instance.options) layerEntry.instance.options.pane = paneName;
                    map.addLayer(layerEntry.instance);
                }
            } else {
                if (map.hasLayer(layerEntry.instance)) map.removeLayer(layerEntry.instance);
            }
            layerEntry.visible = isVisible;
            updateLegend();
        } else {
            const config = layersConfig.find(c => c.id === layerId);
            if (config && isVisible) {
                console.log(`Carregando ${config.title} sob demanda...`);
                loadAndAddLayer(config, false).then(loadedLayerInstance => {
                    if (loadedLayerInstance) {
                        if (activeThematicLayers[layerId]) {
                            activeThematicLayers[layerId].visible = true;
                            if (!activeThematicLayers[layerId].instance) activeThematicLayers[layerId].instance = loadedLayerInstance;
                        } else {
                            activeThematicLayers[layerId] = { instance: loadedLayerInstance, config: config, visible: true };
                        }
                        if (!map.hasLayer(loadedLayerInstance)) map.addLayer(loadedLayerInstance);
                        updateLegend();
                    } else {
                        const chkBox = document.getElementById(`chk-${layerId}`);
                        if (chkBox) chkBox.checked = false;
                        if (activeThematicLayers[layerId]) activeThematicLayers[layerId].visible = false;
                    }
                });
            } else if (config && !isVisible && activeThematicLayers[layerId] && activeThematicLayers[layerId].instance) {
                if (map.hasLayer(activeThematicLayers[layerId].instance)) map.removeLayer(activeThematicLayers[layerId].instance);
                activeThematicLayers[layerId].visible = false;
                updateLegend();
            }
        }
    }

    function updateLegend() {
        if (!legendContainer) return;
        legendContainer.innerHTML = '<h4>Legendas Ativas</h4>';
        let legendContentFound = false;

        layerOrder.forEach(layerId => {
            const layerEntry = activeThematicLayers[layerId];
            if (layerEntry && layerEntry.visible && layerEntry.instance && map.hasLayer(layerEntry.instance) && typeof layerEntry.config.legendFn === 'function') {
                const legendData = layerEntry.config.legendFn();
                if (legendData) {
                    const legendSection = document.createElement('div');
                    legendSection.className = 'legend-section-item';
                    legendSection.innerHTML = `<h5>${layerEntry.config.title}</h5>`;

                    if (legendData.type === 'raster_ramp' && legendData.colors && legendData.labels) {
                        const rampDiv = document.createElement('div');
                        rampDiv.className = 'legend-raster-ramp';
                        rampDiv.style.background = `linear-gradient(to right, ${legendData.colors.join(',')})`;
                        legendSection.appendChild(rampDiv);
                        const labelsDiv = document.createElement('div');
                        labelsDiv.className = 'legend-raster-labels';
                        labelsDiv.innerHTML = `<span>${legendData.labels[0]}</span><span>${legendData.labels[legendData.labels.length - 1]}</span>`;
                        legendSection.appendChild(labelsDiv);
                    } else if (Array.isArray(legendData)) {
                        legendData.forEach(item => {
                            const itemDiv = document.createElement('div'); itemDiv.className = 'legend-item';
                            let swatchHtml = '';
                            if (item.type === 'icon' && item.iconClass) {
                                swatchHtml = `<i class="${item.iconClass}" style="color:${item.color || '#000'}; margin-right:8px; font-size:1.1em; vertical-align: middle;"></i>`;
                            } else if (item.type === 'line' && item.style) {
                                swatchHtml = `<span style="display:inline-block; width:20px; height:${item.style.weight || 2}px; background-color:${item.style.color || '#000'}; margin-right:8px; vertical-align:middle; border: 1px solid ${item.style.color || '#000'};"></span>`;
                            } else {
                                swatchHtml = `<span class="legend-swatch" style="background-color:${item.color}; ${item.isPoint ? 'border-radius:50%; width:12px; height:12px; display:inline-block;' : ''} opacity:${item.opacity || 1};"></span>`;
                            }
                            itemDiv.innerHTML = `${swatchHtml} ${item.label}`;
                            legendSection.appendChild(itemDiv);
                        });
                    } else if (typeof legendData === 'string') {
                        legendSection.innerHTML += legendData;
                    }
                    legendContainer.appendChild(legendSection);
                    legendContentFound = true;
                }
            }
        });
        legendContainer.style.display = legendContentFound ? 'block' : 'none';
    }

    function initializeLayerControls() {
        if (!vectorListDiv || !rasterListDiv) {
            console.error("Divs para listas de camadas não encontradas ao inicializar controles.");
            return;
        }
        layersConfig.forEach(config => {
            if (!layerOrder.includes(config.id)) {
                layerOrder.push(config.id);
            }
            if (!activeThematicLayers[config.id]) {
                activeThematicLayers[config.id] = { instance: null, config: config, visible: config.visible };
            }
        });

        rebuildLayerListUI();

        layersConfig.forEach(config => {
            if (config.visible) {
                toggleLayerVisibility(config.id, true);
            }
        });
    }

    function moveLayerUI(layerIdToMove, direction) {
        const currentIndex = layerOrder.indexOf(layerIdToMove);
        if (currentIndex === -1) return;

        let targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

        if (targetIndex >= 0 && targetIndex < layerOrder.length) {
            const [movedItem] = layerOrder.splice(currentIndex, 1);
            layerOrder.splice(targetIndex, 0, movedItem);

            rebuildLayerListUI();
            applyMapLayerOrder();
            updateLegend();
        }
    }

    function rebuildLayerListUI() {
        if (!vectorListDiv || !rasterListDiv) return;
        vectorListDiv.innerHTML = '';
        rasterListDiv.innerHTML = '';

        layerOrder.forEach(id => {
            const layerConfig = layersConfig.find(lc => lc.id === id);
            if (layerConfig) {
                const listItem = document.createElement('div');
                listItem.className = 'layer-item';
                listItem.setAttribute('data-layerid', layerConfig.id);
                const currentLayerEntry = activeThematicLayers[layerConfig.id];
                const isChecked = currentLayerEntry ? currentLayerEntry.visible : layerConfig.visible;

                listItem.innerHTML = `
                    <input type="checkbox" id="chk-${layerConfig.id}" data-layerid="${layerConfig.id}" ${isChecked ? 'checked' : ''}>
                    <label for="chk-${layerConfig.id}">
                        <i class="${layerConfig.icon}"></i> ${layerConfig.title}
                    </label>
                    <span class="layer-actions">
                        <button class="btn-layer-up" title="Mover para cima"><i class="fas fa-arrow-up"></i></button>
                        <button class="btn-layer-down" title="Mover para baixo"><i class="fas fa-arrow-down"></i></button>
                    </span>
                `;
                if (layerConfig.type === 'vector') {
                    vectorListDiv.appendChild(listItem);
                } else if (layerConfig.type === 'raster') {
                    rasterListDiv.appendChild(listItem);
                }

                const chkBox = listItem.querySelector(`#chk-${layerConfig.id}`);
                if (chkBox) {
                    chkBox.addEventListener('change', function () {
                        toggleLayerVisibility(this.dataset.layerid, this.checked);
                    });
                }
                listItem.querySelector('.btn-layer-up').addEventListener('click', () => moveLayerUI(layerConfig.id, 'up'));
                listItem.querySelector('.btn-layer-down').addEventListener('click', () => moveLayerUI(layerConfig.id, 'down'));
            }
        });
    }

    function applyMapLayerOrder() {
        console.log("Aplicando nova ordem de camadas no mapa:", layerOrder);
        Object.values(activeThematicLayers).forEach(layerEntry => {
            if (layerEntry.instance && map.hasLayer(layerEntry.instance)) {
                map.removeLayer(layerEntry.instance);
            }
        });
        layerOrder.forEach(id => {
            const layerEntry = activeThematicLayers[id];
            if (layerEntry && layerEntry.visible && layerEntry.instance) {
                const paneName = layerEntry.config.type === 'raster' ? 'rasterThemePane' : getVectorPaneName(window[layerEntry.config.varName]);
                if (layerEntry.instance.options) {
                    layerEntry.instance.options.pane = paneName;
                }
                map.addLayer(layerEntry.instance);
            }
        });
        console.log("Ordem de camadas no mapa atualizada.");
    }

    initializeLayerControls();

    // -------------------------------------------------------------------------
    // CONTROLES LEAFLET (Ferramentas no Mapa)
    // -------------------------------------------------------------------------
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    // Não é necessário criar a 'drawnItemsPane' explicitamente aqui se quisermos que
    // o Leaflet.Draw use as panes padrão (overlayPane, markerPane),
    // o que pode resolver problemas de interação de clique.
    // O z-index da overlayPane (400) e markerPane (600) já é alto.
    // Se quisermos que os itens desenhados fiquem sobre TUDO, exceto popups/tooltips:
    map.createPane('userDrawings');
    map.getPane('userDrawings').style.zIndex = 620; // Entre markerPane e tooltipPane


    setTimeout(function () {
        try {
            console.log("Tentando adicionar controles Leaflet (incluindo Draw)...");

            if (typeof L.Control.Draw === 'function') {
                const drawControl = new L.Control.Draw({
                    position: 'topleft',
                    edit: { featureGroup: drawnItems, remove: true },
                    draw: {
                        polyline: {
                            shapeOptions: { color: '#4CAF50', weight: 3, opacity: 0.8 /* , pane: 'userDrawings' */ }, // Removido pane explícito temporariamente
                            metric: true, feet: false, showLength: true
                        },
                        polygon: {
                            shapeOptions: { color: '#FF9800', weight: 1, opacity: 0.8, fillOpacity: 0.3 /* , pane: 'userDrawings' */ }, // Removido pane explícito
                            allowIntersection: false,
                            drawError: { color: '#FF0000', message: 'Erro: os lados não podem cruzar!' },
                            showArea: true, metric: true, feet: false,
                        },
                        rectangle: false, circle: false, marker: false, circlemarker: false
                    }
                });
                map.addControl(drawControl);
                console.log("Controle Leaflet.Draw adicionado.");

                L.drawLocal.draw.toolbar.actions.title = 'Cancelar desenho'; L.drawLocal.draw.toolbar.actions.text = 'Cancelar';
                L.drawLocal.draw.toolbar.finish.title = 'Finalizar desenho'; L.drawLocal.draw.toolbar.finish.text = 'Finalizar';
                L.drawLocal.draw.toolbar.undo.title = 'Remover último ponto'; L.drawLocal.draw.toolbar.undo.text = 'Desfazer';
                L.drawLocal.draw.handlers.polyline.tooltip.start = 'Clique para iniciar linha.';
                L.drawLocal.draw.handlers.polyline.tooltip.cont = 'Clique para continuar linha.';
                L.drawLocal.draw.handlers.polyline.tooltip.end = 'Clique no último ponto para finalizar.';
                L.drawLocal.draw.handlers.polygon.tooltip.start = 'Clique para iniciar polígono.';
                L.drawLocal.draw.handlers.polygon.tooltip.cont = 'Clique para continuar polígono.';
                L.drawLocal.draw.handlers.polygon.tooltip.end = 'Clique no primeiro ponto para fechar.';
                L.drawLocal.edit.toolbar.actions.save.title = 'Salvar.'; L.drawLocal.edit.toolbar.actions.save.text = 'Salvar';
                L.drawLocal.edit.toolbar.actions.cancel.title = 'Cancelar.'; L.drawLocal.edit.toolbar.actions.cancel.text = 'Cancelar';
                L.drawLocal.edit.toolbar.actions.clearAll.title = 'Limpar tudo.'; L.drawLocal.edit.toolbar.actions.clearAll.text = 'Limpar Tudo';
                L.drawLocal.edit.handlers.edit.tooltip.text = 'Arraste marcadores para editar.';
                L.drawLocal.edit.handlers.edit.tooltip.subtext = 'Clique em cancelar para desfazer.';
                L.drawLocal.edit.handlers.remove.tooltip.text = 'Clique em uma forma para remover.';

                map.on('draw:drawstart', function (e) { console.log('Draw Event: drawstart', e.layerType); });
                map.on('draw:drawvertex', function (e) { /* console.log('Draw Event: drawvertex'); */ });
                map.on('draw:canceled', function (e) { console.log('Draw Event: canceled', e.layerType); });
                map.on('draw:editstart', function (e) { console.log('Draw Event: editstart'); });
                map.on('draw:edited', function (e) { console.log('Draw Event: edited'); });
                map.on('draw:deletestart', function (e) { console.log('Draw Event: deletestart'); });
                map.on('draw:deleted', function (e) { console.log('Draw Event: deleted'); });
                map.on('draw:drawstop', function (e) { console.log('Draw Event: drawstop - Tipo:', e.layerType); });


                map.on(L.Draw.Event.CREATED, function (event) {
                    const layer = event.layer; const type = event.layerType; let content = "";
                    console.log('Draw Event: created - Tipo:', type, 'Layer Options:', layer.options);

                    // Se você criou a pane 'userDrawings', pode atribuir a camada a ela:
                    // if (layer.options) { layer.options.pane = 'userDrawings'; } 
                    // else { layer.options = { pane: 'userDrawings' }; }

                    if (type === 'polyline') {
                        let length = 0; const latlngs = layer.getLatLngs();
                        if (Array.isArray(latlngs) && latlngs.length > 0) {
                            if (latlngs[0] instanceof L.LatLng) {
                                for (let i = 0; i < latlngs.length - 1; i++) { length += latlngs[i].distanceTo(latlngs[i + 1]); }
                            } else if (Array.isArray(latlngs[0])) {
                                latlngs.forEach(function (linePart) { for (let i = 0; i < linePart.length - 1; i++) { length += linePart[i].distanceTo(linePart[i + 1]); } });
                            }
                        }
                        content = `Comprimento: ${formatLength(length)}`;
                    } else if (type === 'polygon') {
                        const latlngs = layer.getLatLngs()[0];
                        if (L.GeometryUtil && typeof L.GeometryUtil.geodesicArea === 'function' && latlngs && latlngs.length > 2) {
                            content = `Área: ${formatArea(L.GeometryUtil.geodesicArea(latlngs))}`;
                        } else { content = "Área: (cálculo indisponível)"; }
                    }
                    if (content) layer.bindPopup(`<b>${content}</b><br><small>Pode editar/excluir.</small>`).openPopup();
                    else layer.bindPopup("Forma desenhada.");

                    drawnItems.addLayer(layer);
                });
            } else { console.error("ERRO: L.Control.Draw NÃO é uma função."); }

            if (typeof L.control.locate === 'function') {
                L.control.locate({ position: 'topleft', strings: { title: "Minha localização", popup: "Você está aqui!" }, flyTo: true, icon: 'fas fa-location-crosshairs', iconLoading: 'fas fa-spinner fa-spin' }).addTo(map);
                console.log("Controle de Geolocalização adicionado.");
            } else { console.error("ERRO: L.control.locate NÃO é uma função."); }

            if (typeof L.Control.Geocoder === 'function' && typeof L.Control.Geocoder.nominatim === 'function') {
                L.Control.geocoder({ defaultMarkGeocode: true, placeholder: 'Pesquisar endereço...', position: 'topleft', geocoder: L.Control.Geocoder.nominatim() })
                    .on('markgeocode', e => { if (e.geocode && e.geocode.center) map.setView(e.geocode.center, 15); }).addTo(map);
                console.log("Controle de Geocoder adicionado.");
            } else { console.error("ERRO: L.Control.Geocoder NÃO é uma função."); }

            L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
            console.log("Controle de Escala adicionado.");
            map.invalidateSize();
            console.log("map.invalidateSize() chamado.");

        } catch (e) {
            console.error("Erro EXCEPCIONAL ao adicionar controles Leaflet:", e);
        }
    }, 350);

    function formatLength(m) { return m > 1000 ? (m / 1000).toFixed(2) + ' km' : m.toFixed(0) + ' m'; }
    function formatArea(sqM) {
        if (sqM > 1000000) return (sqM / 1000000).toFixed(3) + ' km²';
        if (sqM > 10000) return (sqM / 10000).toFixed(2) + ' ha';
        return sqM.toFixed(0) + ' m²';
    }

    console.log("Fim do script.js.");
});