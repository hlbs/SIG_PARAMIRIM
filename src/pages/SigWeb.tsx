import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { circleMarker, type LeafletMouseEvent, type Layer, type Map as LeafletMap, type PathOptions } from 'leaflet'
import { GeoJSON, MapContainer, Pane, Popup, ScaleControl, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet'
import GeoRasterOverlay from '@/components/map/GeoRasterOverlay'
import LeafletAdvancedControls from '@/components/map/LeafletAdvancedControls'
import NumericScaleControl from '@/components/map/NumericScaleControl'

type VectorLayerConfig = {
  id: string
  label: string
  file: string
  defaultVisible: boolean
  source: string
  classificationField?: string
}

type LayerState = {
  status: 'loading' | 'loaded' | 'missing' | 'error'
  data?: GeoJSON.FeatureCollection
}

type BaseMapId = 'osm' | 'humanitarian' | 'satellite' | 'topo'
type PanelTab = 'base' | 'vector' | 'raster'

type RasterLayer = {
  id: string
  label: string
  file: string
  defaultVisible: boolean
  legend: string
  source: string
  range: string
  steps: Array<{ color: string; label: string }>
  colorizer: (value: number, min: number, max: number) => string | null
}

type LegendItem = {
  label: string
  color: string
  dashArray?: string
  symbol?: 'polygon' | 'line' | 'point'
}

type VectorLegendEntry = {
  layerId: string
  layerLabel: string
  classField: string
  items: LegendItem[]
}

type LayerHit = {
  layerId: string
  layerLabel: string
  properties: Record<string, unknown>
}

type LayerHitPopup = {
  position: [number, number]
  hits: LayerHit[]
  index: number
}

type RasterLoadState = {
  state: 'idle' | 'loading' | 'ready' | 'error'
  message?: string
}

type SigLayer = Layer & {
  __sigMeta?: LayerHit
  _containsPoint?: (point: unknown) => boolean
}

const BASE_URL = import.meta.env.BASE_URL

function resolvePublicPath(path: string): string {
  return `${BASE_URL}${path.replace(/^\/+/, '')}`
}

const VECTOR_LAYERS: VectorLayerConfig[] = [
  {
    id: 'bacia',
    label: 'Bacia hidrográfica do Rio Paramirim',
    file: 'data/vetor/bacia_do_rio_paramirim_sirgas2000_utm23s_0.js',
    defaultVisible: true,
    source: 'Elaboração própria a partir de dados de Modelo Digital de Elevação prospectados da base TopoDATA.'
  },
  {
    id: 'drenagem',
    label: 'Rede de drenagem',
    file: 'data/vetor/rede_de_drenagem_bacia_paramirim_sirgas2000_utm23s_7.js',
    defaultVisible: false,
    source: 'Elaboração própria a partir de dados de Modelo Digital de Elevação prospectados da base TopoDATA.',
    classificationField: 'Strahler'
  },
  {
    id: 'geologia',
    label: 'Geologia 1:1.000.000',
    file: 'data/vetor/geologia_1_1000000_sirgas2000_1.js',
    defaultVisible: false,
    source: 'Não informada na base recebida.',
    classificationField: 'nome_unida'
  },
  {
    id: 'geomorfologia',
    label: 'Geomorfologia 1:1.000.000',
    file: 'data/vetor/geomorfologia_1_1000000_sirgas2000_2.js',
    defaultVisible: false,
    source: 'Plano Estadual de Recursos Hídricos (PERH), 2004.',
    classificationField: 'nomeug'
  },
  {
    id: 'solos',
    label: 'Solos 1:1.000.000',
    file: 'data/vetor/solo_1_1000000_sirgas2000_4.js',
    defaultVisible: false,
    source: 'Plano Estadual de Recursos Hídricos (PERH), 2004.',
    classificationField: 'Classeperh'
  },
  {
    id: 'cobertura',
    label: 'Cobertura Vegetal 1:50.000',
    file: 'data/vetor/cobertura_vegetal_1_50000_sirgas2000_3.js',
    defaultVisible: false,
    source: 'Instituto do Meio Ambiente e Recursos Hídricos (INEMA), 2019.',
    classificationField: 'nivel_1'
  },
  {
    id: 'aquifero',
    label: 'Aquíferos 1:1.000.000',
    file: 'data/vetor/aquifero_1_1000000_sirgas2000_5.js',
    defaultVisible: false,
    source: 'Instituto de Gestão das Águas e Clima (INGA) - Universidade Federal da Bahia (UFBA), 2009.',
    classificationField: 'classe'
  },
  {
    id: 'pocos',
    label: 'Poços SIAGAS',
    file: 'data/vetor/pocos_bacia_paramirim_sirgas2000_8.js',
    defaultVisible: false,
    source: 'Sistema de Informações de Águas Subterrâneas (SIAGAS), 2025.'
  },
  {
    id: 'monitoramento',
    label: 'Rede de monitoramento da água',
    file: 'data/vetor/rede_monitoramento_qualidade_da_agua_sirgas2000_6.js',
    defaultVisible: false,
    source: 'Instituto do Meio Ambiente e Recursos Hídricos (INEMA), 2024.'
  }
]

const BASE_MAPS: Record<BaseMapId, { label: string; url: string; attribution: string }> = {
  osm: {
    label: 'OpenStreetMap',
    attribution: '&copy; OpenStreetMap contributors',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  },
  humanitarian: {
    label: 'OSM Humanitarian',
    attribution: '&copy; OpenStreetMap contributors',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'
  },
  satellite: {
    label: 'Esri Satellite',
    attribution: 'Tiles &copy; Esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  },
  topo: {
    label: 'OpenTopoMap',
    attribution: '&copy; OpenStreetMap contributors',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
  }
}

const RASTER_LAYERS: RasterLayer[] = [
  {
    id: 'mde',
    label: 'Modelo digital de elevação',
    file: 'data/raster/mde_sirgas2000.tif',
    defaultVisible: false,
    legend: 'Hipsometria: verde (baixo) até marrom e branco (alto)',
    source: 'TopoDATA, 2025.',
    range: 'Faixa: 400 a 2022 m',
    steps: [
      { color: 'rgb(55, 118, 61)', label: '400 a 800 m' },
      { color: 'rgb(166, 146, 101)', label: '800 a 1200 m' },
      { color: 'rgb(126, 89, 52)', label: '1200 a 1600 m' },
      { color: 'rgb(245, 245, 244)', label: '1600 a 2022 m' }
    ],
    colorizer: (value) => {
      if (!Number.isFinite(value) || value <= 0) return null
      if (value < 800) return 'rgb(55, 118, 61)'
      if (value < 1200) return 'rgb(166, 146, 101)'
      if (value < 1600) return 'rgb(126, 89, 52)'
      return 'rgb(245, 245, 244)'
    }
  },
  {
    id: 'ghi',
    label: 'Irradiação solar global (GHI)',
    file: 'data/raster/ghi_sirgas2000.tif',
    defaultVisible: false,
    legend: 'Baixa para alta irradiação: amarelo claro, laranja e vermelho',
    source: 'Global Solar Atlas, 2025.',
    range: 'Faixa: 4,87 a 6,45 kWh/m²/dia',
    steps: [
      { color: 'rgb(255, 244, 193)', label: '4,87 a 5,2' },
      { color: 'rgb(247, 170, 95)', label: '5,2 a 5,8' },
      { color: 'rgb(186, 42, 34)', label: '5,8 a 6,45' }
    ],
    colorizer: (value) => {
      if (!Number.isFinite(value) || value <= 0) return null
      if (value < 5.2) return 'rgb(255, 244, 193)'
      if (value < 5.8) return 'rgb(247, 170, 95)'
      return 'rgb(186, 42, 34)'
    }
  },
  {
    id: 'wind',
    label: 'Velocidade do vento a 200m',
    file: 'data/raster/wind_200m_sirgas2000.tif',
    defaultVisible: false,
    legend: 'Baixa para alta velocidade: azul claro, médio e escuro',
    source: 'Global Wind Atlas, 2025.',
    range: 'Faixa: 3,07 a 15,92 m/s',
    steps: [
      { color: 'rgb(224, 238, 251)', label: '3,07 a 6,0 m/s' },
      { color: 'rgb(97, 158, 201)', label: '6,0 a 10,0 m/s' },
      { color: 'rgb(20, 64, 122)', label: '10,0 a 15,92 m/s' }
    ],
    colorizer: (value) => {
      if (!Number.isFinite(value) || value <= 0) return null
      if (value < 6) return 'rgb(224, 238, 251)'
      if (value < 10) return 'rgb(97, 158, 201)'
      return 'rgb(20, 64, 122)'
    }
  }
]

const RASTER_Z_INDEX: Record<string, number> = {
  mde: 440,
  ghi: 441,
  wind: 442
}

const POPUP_LABELS: Record<string, string> = {
  gid: 'Identificador',
  fid: 'Identificador',
  codigo: 'Código',
  nivel1: 'Classe principal',
  nivel2: 'Classe secundária',
  nivel3: 'Classe detalhada',
  nomeunida: 'Unidade geológica',
  nomeug: 'Unidade geomorfológica',
  classe: 'Classe aquífera',
  strahler: 'Ordem Strahler',
  streamtyp: 'Tipo de curso',
  shreve: 'Shreve',
  zonas: 'Zona',
  sigla: 'Sigla'
}

const CATEGORY_COLORS = ['#2b8cbe', '#a6611a', '#4d9221', '#762a83', '#c51b7d', '#008b8b', '#b15928', '#1f78b4']
const DASH_PATTERNS = ['2 3', '5 2', '8 3', '3 4']

const BASE_VECTOR_STYLES: Record<string, PathOptions> = {
  bacia: { color: '#1b78c3', weight: 2.6, fillColor: '#8ec2e8', fillOpacity: 0.2, opacity: 1 },
  geologia: { color: '#7e6143', weight: 1.15, fillColor: '#c0a48a', fillOpacity: 0.28, opacity: 1 },
  geomorfologia: { color: '#6f6f6f', weight: 1.1, fillColor: '#b7b7b7', fillOpacity: 0.25, opacity: 1 },
  solos: { color: '#7c5d40', weight: 1.1, fillColor: '#b7936f', fillOpacity: 0.24, opacity: 1 },
  cobertura: { color: '#397f4d', weight: 1.15, fillColor: '#83ba75', fillOpacity: 0.25, opacity: 1 },
  aquifero: { color: '#3f658f', weight: 1.1, fillColor: '#94bde0', fillOpacity: 0.24, opacity: 1 },
  pocos: { color: '#18485d', weight: 1.1, fillColor: '#18485d', fillOpacity: 0.9, opacity: 1 },
  monitoramento: { color: '#6f3f1b', weight: 1.9, fillColor: '#6f3f1b', fillOpacity: 0.9, opacity: 1 }
}

const FIXED_LAYER_CATEGORY_COLORS: Record<string, Record<string, string>> = {
  aquifero: {
    metassedimentar: '#7b3294',
    cristalino: '#1f78b4',
    granular: '#e66101'
  }
}
function parseGeoPayload(payload: string): GeoJSON.FeatureCollection | null {
  const start = payload.indexOf('{')
  const end = payload.lastIndexOf('}')

  if (start < 0 || end < 0 || end <= start) return null

  try {
    return JSON.parse(payload.slice(start, end + 1)) as GeoJSON.FeatureCollection
  } catch {
    return null
  }
}

async function loadVectorLayer(file: string): Promise<LayerState> {
  try {
    const response = await fetch(resolvePublicPath(file))
    if (!response.ok) return { status: 'missing' }

    const text = await response.text()
    const parsed = parseGeoPayload(text)
    if (!parsed) return { status: 'error' }

    return { status: 'loaded', data: parsed }
  } catch {
    return { status: 'error' }
  }
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function titleize(value: string): string {
  const clean = value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()

  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function toFriendlyLabel(key: string): string {
  const direct = POPUP_LABELS[normalizeKey(key)]
  if (direct) return direct
  return titleize(key)
}

function isValidAttribute(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0

  const text = String(value).trim()
  if (!text) return false

  const normalized = normalizeKey(text)
  if (!normalized) return false
  if (normalized === 'null' || normalized === 'undefined' || normalized === 'nan') return false
  if (normalized === '0' || normalized === '00' || normalized === '000') return false

  return true
}

function getLayerById(layerId: string): VectorLayerConfig {
  return VECTOR_LAYERS.find((item) => item.id === layerId) ?? VECTOR_LAYERS[0]
}

function getCategoryValue(layerId: string, feature: GeoJSON.Feature): string | null {
  const field = getLayerById(layerId).classificationField
  if (!field) return null

  const props = (feature.properties ?? {}) as Record<string, unknown>
  const target = normalizeKey(field)

  for (const [key, raw] of Object.entries(props)) {
    if (normalizeKey(key) !== target) continue
    if (!isValidAttribute(raw)) return null
    return String(raw).trim()
  }

  return null
}

function hashColorIndex(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100000
  }
  return Math.abs(hash) % CATEGORY_COLORS.length
}

function getCategoryColor(value: string): string {
  return CATEGORY_COLORS[hashColorIndex(value)]
}

function getLayerCategoryColor(layerId: string, category: string): string {
  const fixed = FIXED_LAYER_CATEGORY_COLORS[layerId]
  if (fixed) {
    const normalizedCategory = normalizeKey(category)
    for (const [key, color] of Object.entries(fixed)) {
      const normalizedKey = normalizeKey(key)
      if (normalizedCategory === normalizedKey || normalizedCategory.includes(normalizedKey)) {
        return color
      }
    }
  }
  return getCategoryColor(category)
}

function getDefaultLegendItem(layerId: string): LegendItem {
  const style = BASE_VECTOR_STYLES[layerId] ?? { color: '#446c8f' }
  if (layerId === 'drenagem') {
    return { label: 'Traçado principal', color: String(style.color ?? '#446c8f'), symbol: 'line' }
  }
  if (layerId === 'pocos' || layerId === 'monitoramento') {
    return { label: 'Pontos cadastrados', color: String(style.color ?? '#18485d'), symbol: 'point' }
  }
  return { label: 'Área da camada', color: String(style.fillColor ?? style.color ?? '#446c8f'), symbol: 'polygon' }
}

function drainageStyle(strahlerRaw: string, opacity: number): PathOptions {
  const level = Number(strahlerRaw)
  if (!Number.isFinite(level)) {
    return { color: '#2b83c6', weight: 1.3, opacity }
  }

  const styles: Record<number, { color: string; weight: number }> = {
    1: { color: '#90cdf4', weight: 1.1 },
    2: { color: '#63b3ed', weight: 1.8 },
    3: { color: '#2b6cb0', weight: 2.5 },
    4: { color: '#1a365d', weight: 3.2 }
  }

  const selected = styles[level] ?? { color: '#2b83c6', weight: 1.4 + level * 0.4 }
  return { color: selected.color, weight: selected.weight, opacity }
}

function vectorStyle(layerId: string, feature: GeoJSON.Feature, opacity: number): PathOptions {
  if (layerId === 'drenagem') {
    const category = getCategoryValue(layerId, feature)
    return drainageStyle(category ?? '1', opacity)
  }

  const baseTemplate = BASE_VECTOR_STYLES[layerId] ?? { color: '#446c8f', weight: 1.1, fillOpacity: 0.3, opacity: 1 }
  const base = {
    ...baseTemplate,
    opacity,
    fillOpacity: Number(baseTemplate.fillOpacity ?? 0.3) * opacity
  }
  const category = getCategoryValue(layerId, feature)

  if (!category || layerId === 'bacia' || layerId === 'monitoramento' || layerId === 'pocos') {
    return base
  }

  const pattern = DASH_PATTERNS[hashColorIndex(category) % DASH_PATTERNS.length]
  const color = getLayerCategoryColor(layerId, category)

  return {
    ...base,
    color,
    fillColor: color,
    fillOpacity: 0.26 * opacity,
    dashArray: pattern
  }
}

function statusText(status: LayerState['status']): string {
  if (status === 'loaded') return 'Carregada'
  if (status === 'loading') return 'Carregando'
  if (status === 'missing') return 'Não encontrada'
  return 'Erro de leitura'
}

function popupRows(properties: Record<string, unknown>): Array<{ key: string; value: string }> {
  return Object.entries(properties)
    .filter(([, value]) => isValidAttribute(value))
    .slice(0, 16)
    .map(([key, value]) => ({ key: toFriendlyLabel(key), value: String(value).trim() }))
}

function moveLayer(order: string[], layerId: string, direction: 'up' | 'down'): string[] {
  const index = order.indexOf(layerId)
  if (index < 0) return order

  if (direction === 'up' && index > 0) {
    const next = [...order]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    return next
  }

  if (direction === 'down' && index < order.length - 1) {
    const next = [...order]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    return next
  }

  return order
}

function MapClickCloser({ onClick }: { onClick: () => void }) {
  useMapEvents({
    click: () => onClick()
  })
  return null
}

export default function SigWeb() {
  const mapShellRef = useRef<HTMLDivElement | null>(null)

  const [baseMap, setBaseMap] = useState<BaseMapId>('osm')
  const [panelOpen, setPanelOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<PanelTab>('vector')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rasterOpacity, setRasterOpacity] = useState(0.63)
  const [activeRasterId, setActiveRasterId] = useState<string | null>(null)
  const [rasterLoadState, setRasterLoadState] = useState<RasterLoadState>({ state: 'idle' })
  const [layerHitPopup, setLayerHitPopup] = useState<LayerHitPopup | null>(null)
  const suppressNextMapClickRef = useRef(false)

  const [vectorStates, setVectorStates] = useState<Record<string, LayerState>>(() => {
    const initial: Record<string, LayerState> = {}
    VECTOR_LAYERS.forEach((layer) => {
      initial[layer.id] = { status: 'loading' }
    })
    return initial
  })

  const [activeVectors, setActiveVectors] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    VECTOR_LAYERS.forEach((layer) => {
      initial[layer.id] = layer.defaultVisible
    })
    return initial
  })

  const [vectorOrder, setVectorOrder] = useState<string[]>(() => VECTOR_LAYERS.map((layer) => layer.id))
  const [vectorOpacity, setVectorOpacity] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    VECTOR_LAYERS.forEach((layer) => {
      initial[layer.id] = layer.id === 'bacia' ? 0.85 : 0.7
    })
    return initial
  })
  const [metaOpen, setMetaOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      const entries = await Promise.all(
        VECTOR_LAYERS.map(async (layer) => [layer.id, await loadVectorLayer(layer.file)] as const)
      )

      if (!mounted) return
      setVectorStates(Object.fromEntries(entries))
    }

    bootstrap()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [])

  useEffect(() => {
    setLayerHitPopup((current) => {
      if (!current) return current
      const filteredHits = current.hits.filter((hit) => activeVectors[hit.layerId])
      if (filteredHits.length === 0) return null
      const nextIndex = Math.min(current.index, filteredHits.length - 1)
      return {
        ...current,
        hits: filteredHits,
        index: nextIndex
      }
    })
  }, [activeVectors])

  const loadedCount = useMemo(() => Object.values(vectorStates).filter((item) => item.status === 'loaded').length, [vectorStates])
  const activeVectorCount = useMemo(() => Object.values(activeVectors).filter(Boolean).length, [activeVectors])

  const orderedLayers = useMemo(() => {
    return vectorOrder
      .map((layerId) => VECTOR_LAYERS.find((layer) => layer.id === layerId))
      .filter((layer): layer is VectorLayerConfig => Boolean(layer))
  }, [vectorOrder])

  const renderOrderedLayers = useMemo(() => [...orderedLayers].reverse(), [orderedLayers])
  const layerOrderRank = useMemo(() => {
    const rank: Record<string, number> = {}
    orderedLayers.forEach((layer, index) => {
      rank[layer.id] = index
    })
    return rank
  }, [orderedLayers])

  const activeRasterLayer = useMemo(() => {
    if (!activeRasterId) return null
    return RASTER_LAYERS.find((layer) => layer.id === activeRasterId) ?? null
  }, [activeRasterId])

  const handleRasterStatusChange = useCallback((status: { state: 'loading' | 'ready' | 'error'; message?: string }) => {
    console.debug('[SIG Raster Debug] SigWeb:onStatusChange', status)
    setRasterLoadState((current) => {
      if (current.state === status.state && current.message === status.message) return current
      return { state: status.state, message: status.message }
    })
  }, [])

  const activeRasterColorizer = useMemo(() => {
    if (!activeRasterLayer) return undefined
    return (value: number, context: { min: number; max: number }) => activeRasterLayer.colorizer(value, context.min, context.max)
  }, [activeRasterLayer])

  useEffect(() => {
    if (!activeRasterLayer) {
      setRasterLoadState((current) => (current.state === 'idle' && !current.message ? current : { state: 'idle' }))
    }
  }, [activeRasterLayer])

  useEffect(() => {
    console.debug('[SIG Raster Debug] SigWeb:activeRasterId', { activeRasterId })
  }, [activeRasterId])

  useEffect(() => {
    console.debug('[SIG Raster Debug] SigWeb:rasterLoadState', rasterLoadState)
  }, [rasterLoadState])

  const activeHit = layerHitPopup ? layerHitPopup.hits[layerHitPopup.index] : null
  const activeHitRows = useMemo(
    () => (activeHit ? popupRows(activeHit.properties) : []),
    [activeHit]
  )

  const vectorLegends = useMemo(() => {
    const result: VectorLegendEntry[] = []

    orderedLayers.forEach((layer) => {
      if (!activeVectors[layer.id]) return

      const state = vectorStates[layer.id]
      const fallback = getDefaultLegendItem(layer.id)
      if (state?.status !== 'loaded' || !state.data) {
        result.push({
          layerId: layer.id,
          layerLabel: layer.label,
          classField: 'Camada ativa',
          items: [fallback]
        })
        return
      }

      if (layer.id === 'drenagem') {
        result.push({
          layerId: layer.id,
          layerLabel: layer.label,
          classField: 'Strahler',
          items: [
            { label: 'Ordem 1', color: '#90cdf4', symbol: 'line' },
            { label: 'Ordem 2', color: '#63b3ed', symbol: 'line' },
            { label: 'Ordem 3', color: '#2b6cb0', symbol: 'line' },
            { label: 'Ordem 4', color: '#1a365d', symbol: 'line' }
          ]
        })
        return
      }

      if (layer.classificationField) {
        const counters = new Map<string, number>()
        state.data.features.forEach((feature) => {
          const category = getCategoryValue(layer.id, feature)
          if (!category) return
          counters.set(category, (counters.get(category) ?? 0) + 1)
        })

        const items = Array.from(counters.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([label]) => ({
            label,
            color: getLayerCategoryColor(layer.id, label),
            dashArray: DASH_PATTERNS[hashColorIndex(label) % DASH_PATTERNS.length],
            symbol: layer.id === 'pocos' ? ('point' as const) : ('polygon' as const)
          }))

        if (items.length > 0) {
          result.push({
            layerId: layer.id,
            layerLabel: layer.label,
            classField: layer.classificationField,
            items
          })
          return
        }
      }

      result.push({
        layerId: layer.id,
        layerLabel: layer.label,
        classField: 'Estilo base',
        items: [fallback]
      })
    })

    return result
  }, [orderedLayers, vectorStates, activeVectors])

  function toggleFullscreen() {
    const element = mapShellRef.current
    if (!element) return

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return
    }

    void element.requestFullscreen().catch(() => {})
  }

  function toggleMeta(key: string) {
    setMetaOpen((current) => ({ ...current, [key]: !current[key] }))
  }

  function shiftHitPopup(step: number) {
    setLayerHitPopup((current) => {
      if (!current || current.hits.length < 2) return current
      const next = (current.index + step + current.hits.length) % current.hits.length
      return { ...current, index: next }
    })
  }

  function openHitPopupFromFeatureClick(
    event: LeafletMouseEvent,
    layerId: string,
    layerLabel: string,
    properties: Record<string, unknown>
  ) {
    suppressNextMapClickRef.current = true
    event.originalEvent.stopPropagation()

    const map = (event.target as unknown as { _map?: LeafletMap })._map
    if (!map) return

    const clickPoint = map.latLngToLayerPoint(event.latlng)
    const hitsByLayer = new Map<string, LayerHit>()

    map.eachLayer((candidate) => {
      const sigLayer = candidate as SigLayer
      if (!sigLayer.__sigMeta) return
      if (typeof sigLayer._containsPoint !== 'function') return
      if (!sigLayer._containsPoint(clickPoint)) return

      if (!hitsByLayer.has(sigLayer.__sigMeta.layerId)) {
        hitsByLayer.set(sigLayer.__sigMeta.layerId, sigLayer.__sigMeta)
      }
    })

    if (!hitsByLayer.has(layerId)) {
      hitsByLayer.set(layerId, { layerId, layerLabel, properties })
    }

    const hits = Array.from(hitsByLayer.values())
      .sort((a, b) => (layerOrderRank[a.layerId] ?? 999) - (layerOrderRank[b.layerId] ?? 999))

    setLayerHitPopup({
      position: [event.latlng.lat, event.latlng.lng],
      hits,
      index: 0
    })
  }

  return (
    <section className="page-card sig-page">
      <header className="section-top">
        <div>
          <p className="eyebrow">Núcleo cartográfico</p>
          <h1>SIG Web Paramirim</h1>
          <p className="subtle">Painel interno com transparência e ordem de camadas, legenda temática e metadados para apoio técnico.</p>
        </div>
      </header>

      <div className="sig-map-shell" ref={mapShellRef}>
        <MapContainer
          center={[-13.25, -42.5]}
          zoom={8}
          className="sig-map sig-map-full"
          scrollWheelZoom
          zoomControl={false}
          preferCanvas
        >
          <MapClickCloser onClick={() => {
            if (suppressNextMapClickRef.current) {
              suppressNextMapClickRef.current = false
              return
            }
            setLayerHitPopup(null)
          }}
          />
          <TileLayer key={baseMap} url={BASE_MAPS[baseMap].url} attribution={BASE_MAPS[baseMap].attribution} />
          <ZoomControl position="topright" />
          <LeafletAdvancedControls />

          {renderOrderedLayers.map((layer, drawOrder) => {
            const layerState = vectorStates[layer.id]
            if (!layerState || layerState.status !== 'loaded' || !layerState.data || !activeVectors[layer.id]) return null

            const layerOpacity = vectorOpacity[layer.id] ?? 0.7
            const paneZIndex = 460 + drawOrder

            return (
              <Pane key={`pane-${layer.id}`} name={`vector-${layer.id}`} style={{ zIndex: paneZIndex }}>
                <GeoJSON
                  key={layer.id}
                  data={layerState.data}
                  style={(feature) => vectorStyle(layer.id, feature as GeoJSON.Feature, layerOpacity)}
                  pointToLayer={(feature, latlng) => {
                    const category = getCategoryValue(layer.id, feature as GeoJSON.Feature)
                    const fallbackStyle = vectorStyle(layer.id, feature as GeoJSON.Feature, layerOpacity)
                    const baseColor = category
                      ? getLayerCategoryColor(layer.id, category)
                      : ((fallbackStyle.color as string) || '#2d5f81')

                    return circleMarker(latlng, {
                      color: baseColor,
                      fillColor: baseColor,
                      fillOpacity: layer.id === 'pocos' ? 0.95 * layerOpacity : 0.75 * layerOpacity,
                      radius: layer.id === 'pocos' ? 4.8 : 3.9,
                      weight: 1
                    })
                  }}
                  onEachFeature={(feature, leafletLayer) => {
                    const raw = feature as { properties?: Record<string, unknown> }
                    const properties = raw.properties ?? {}
                    ;(leafletLayer as SigLayer).__sigMeta = {
                      layerId: layer.id,
                      layerLabel: layer.label,
                      properties
                    }

                    leafletLayer.on('click', (event: LeafletMouseEvent) => {
                      openHitPopupFromFeatureClick(event, layer.id, layer.label, properties)
                    })
                  }}
                />
              </Pane>
            )
          })}

          {activeRasterLayer && (
            <GeoRasterOverlay
              rasterKey={activeRasterLayer.id}
              url={resolvePublicPath(activeRasterLayer.file)}
              visible
              resolution={128}
              zIndex={RASTER_Z_INDEX[activeRasterLayer.id] ?? 440}
              opacity={rasterOpacity}
              colorizer={activeRasterColorizer}
              onStatusChange={handleRasterStatusChange}
            />
          )}

          {layerHitPopup && activeHit && (
            <Popup position={layerHitPopup.position}>
              <div className="map-popup">
                <div className="map-popup-head">
                  <strong className="map-popup-layer">{activeHit.layerLabel}</strong>
                  {layerHitPopup.hits.length > 1 && (
                    <div className="map-popup-nav">
                      <button type="button" aria-label="Camada anterior" onClick={() => shiftHitPopup(-1)}>←</button>
                      <span className="map-popup-index">{layerHitPopup.index + 1}/{layerHitPopup.hits.length}</span>
                      <button type="button" aria-label="Próxima camada" onClick={() => shiftHitPopup(1)}>→</button>
                    </div>
                  )}
                </div>

                {activeHitRows.length === 0 ? (
                  <div className="map-popup-empty">Sem atributos válidos para exibição.</div>
                ) : (
                  activeHitRows.map((row) => (
                    <div key={`${activeHit.layerId}-${row.key}`} className="map-popup-row">
                      <span>{row.key}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))
                )}
              </div>
            </Popup>
          )}

          <ScaleControl imperial={false} />
          <NumericScaleControl />
        </MapContainer>

        <button className={`sig-legend-toggle ${legendOpen ? 'open' : ''}`} onClick={() => setLegendOpen((value) => !value)} type="button">
          {legendOpen ? 'Ocultar legenda' : 'Legenda'}
        </button>

        {legendOpen && (
          <aside className="sig-legend-panel" aria-label="Legenda do SIG">
            <h3>Legenda</h3>
            <div className="legend-group-title">Camadas raster</div>
            {activeRasterLayer ? (
              <div className="legend-block active">
                <strong>{activeRasterLayer.label}</strong>
                <small>{activeRasterLayer.range} • ativa</small>
                <ul>
                  {activeRasterLayer.steps.map((step) => (
                    <li key={`${activeRasterLayer.id}-${step.label}`}>
                      <span className="legend-swatch polygon" style={{ backgroundColor: step.color }} />
                      <em>{step.label}</em>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="legend-empty">Nenhuma camada raster ativa.</p>
            )}

            <div className="legend-group-title">Camadas vetoriais ativas</div>
            {vectorLegends.length > 0 ? (
              vectorLegends.map((entry) => (
                <div key={`legend-${entry.layerId}`} className="legend-block">
                  <strong>{entry.layerLabel}</strong>
                  <small>Classificação por: {entry.classField}</small>
                  <ul>
                    {entry.items.map((item) => (
                      <li key={`${entry.layerId}-${item.label}`}>
                        <span
                          className={`legend-swatch ${item.symbol ?? 'polygon'}`}
                          style={{ backgroundColor: item.color, borderStyle: item.dashArray ? 'dashed' : 'solid' }}
                        />
                        <em>{item.label}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : <p className="legend-empty">Ative camadas vetoriais para exibir a legenda.</p>}
          </aside>
        )}
        <button
          className={`sig-fullscreen-btn ${isFullscreen ? 'active' : ''}`}
          onClick={toggleFullscreen}
          type="button"
          aria-label={isFullscreen ? 'Sair do modo tela cheia' : 'Entrar no modo tela cheia'}
        >
          {isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>

        <button
          className={`sig-panel-toggle ${panelOpen ? 'open' : ''}`}
          onClick={() => setPanelOpen((current) => !current)}
          type="button"
          aria-expanded={panelOpen}
          aria-controls="sig-layer-panel"
        >
          {panelOpen ? 'Ocultar camadas' : 'Camadas'}
          <span>{activeVectorCount + (activeRasterLayer ? 1 : 0)}</span>
        </button>

        <aside id="sig-layer-panel" className={`sig-floating-panel ${panelOpen ? 'open' : 'collapsed'}`}>
          <div className="sig-panel-tabs" role="tablist" aria-label="Menu do SIG">
            <button type="button" role="tab" aria-selected={panelTab === 'base'} className={panelTab === 'base' ? 'active' : ''} onClick={() => setPanelTab('base')}>
              Mapa base
            </button>
            <button type="button" role="tab" aria-selected={panelTab === 'vector'} className={panelTab === 'vector' ? 'active' : ''} onClick={() => setPanelTab('vector')}>
              Vetor ({activeVectorCount})
            </button>
            <button type="button" role="tab" aria-selected={panelTab === 'raster'} className={panelTab === 'raster' ? 'active' : ''} onClick={() => setPanelTab('raster')}>
              Raster ({activeRasterLayer ? 1 : 0})
            </button>
          </div>

          {panelTab === 'base' && (
            <section className="sig-panel-section" aria-label="Mapas base">
              <p className="sig-panel-note">Selecione o mapa de referência cartográfica.</p>
              <div className="sig-base-list">
                {Object.entries(BASE_MAPS).map(([id, map]) => (
                  <label key={id} className={`sig-base-option ${baseMap === id ? 'active' : ''}`}>
                    <input type="radio" name="base-map" value={id} checked={baseMap === id} onChange={() => setBaseMap(id as BaseMapId)} />
                    <span>{map.label}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {panelTab === 'vector' && (
            <section className="sig-panel-section" aria-label="Camadas vetoriais">
              <p className="sig-panel-note">{loadedCount} de {VECTOR_LAYERS.length} camadas vetoriais carregadas.</p>
              <ul className="layer-list compact">
                {orderedLayers.map((layer, index) => {
                  const layerState = vectorStates[layer.id] ?? { status: 'loading' as const }
                  const metaKey = `vec:${layer.id}`

                  return (
                    <li key={layer.id}>
                      <div className="layer-main-row">
                        <label>
                          <input
                            type="checkbox"
                            checked={!!activeVectors[layer.id]}
                            onChange={(event) => {
                              setActiveVectors((current) => ({ ...current, [layer.id]: event.target.checked }))
                            }}
                          />
                          <span>{layer.label}</span>
                        </label>
                        <button type="button" className="layer-info-btn" onClick={() => toggleMeta(metaKey)} aria-label={`Fonte de ${layer.label}`}>i</button>
                      </div>

                      <div className="layer-ops-row">
                        <button type="button" onClick={() => setVectorOrder((current) => moveLayer(current, layer.id, 'up'))} disabled={index === 0}>↑</button>
                        <button type="button" onClick={() => setVectorOrder((current) => moveLayer(current, layer.id, 'down'))} disabled={index === orderedLayers.length - 1}>↓</button>
                        <label>
                          <span>Transparência</span>
                          <input
                            type="range"
                            min={0.2}
                            max={1}
                            step={0.05}
                            value={vectorOpacity[layer.id] ?? 0.7}
                            onChange={(event) => {
                              const value = Number(event.target.value)
                              setVectorOpacity((current) => ({ ...current, [layer.id]: value }))
                            }}
                          />
                        </label>
                      </div>

                      {metaOpen[metaKey] && <small className="layer-meta">Fonte: {layer.source}</small>}
                      <small>{statusText(layerState.status)}</small>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {panelTab === 'raster' && (
            <section className="sig-panel-section" aria-label="Camadas raster">
              <p className="sig-panel-note">Selecione uma camada raster por vez para comparação técnica.</p>
              {activeRasterLayer && rasterLoadState.state === 'loading' && (
                <p className="sig-panel-note raster-status loading">Carregando raster em alta resolução...</p>
              )}
              {activeRasterLayer && rasterLoadState.state === 'error' && (
                <p className="sig-panel-note raster-status error">Falha ao carregar raster: {rasterLoadState.message ?? 'erro desconhecido.'}</p>
              )}
              {activeRasterLayer && rasterLoadState.state === 'ready' && (
                <p className="sig-panel-note raster-status ready">Raster ativo e renderizado com sucesso.</p>
              )}

              <label className="raster-opacity">
                <span>Transparência da camada raster</span>
                <input type="range" min={0.15} max={1} step={0.05} value={rasterOpacity} onChange={(event) => setRasterOpacity(Number(event.target.value))} />
                <strong>{Math.round(rasterOpacity * 100)}%</strong>
              </label>

              <ul className="layer-list compact">
                {RASTER_LAYERS.map((layer) => {
                  const checked = activeRasterId === layer.id
                  const metaKey = `ras:${layer.id}`

                  return (
                    <li key={layer.id}>
                      <div className="layer-main-row">
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setActiveRasterId((current) => (current === layer.id ? null : layer.id))
                            }}
                          />
                          <span>{layer.label}</span>
                        </label>
                        <button type="button" className="layer-info-btn" onClick={() => toggleMeta(metaKey)} aria-label={`Fonte de ${layer.label}`}>i</button>
                      </div>

                      <div className={`raster-ramp ${layer.id}`} aria-hidden="true" />
                      <small>{layer.legend}</small>
                      {metaOpen[metaKey] && <small className="layer-meta">Fonte: {layer.source}</small>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </section>
  )
}

