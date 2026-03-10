import { useEffect, useRef } from 'react'
import { type Layer } from 'leaflet'
import { useMap } from 'react-leaflet'
import parseGeoraster from 'georaster'
import GeoRasterLayer from 'georaster-layer-for-leaflet'

type GeoRasterOverlayProps = {
  rasterKey: string
  url: string
  visible?: boolean
  opacity?: number
  resolution?: number
  zIndex?: number
  colorizer?: (value: number, context: { min: number; max: number }) => string | null
  onStatusChange?: (status: { state: 'loading' | 'ready' | 'error'; message?: string }) => void
}

type SigRasterLayer = Layer & {
  setOpacity?: (opacity: number) => void
  setZIndex?: (zIndex: number) => void
  redraw?: () => void
  clearCache?: () => void
  _cache?: { innerTile?: Record<string, unknown>; tile?: Record<string, unknown> }
  _removeAllTiles?: () => void
}

const RASTER_PANE = 'sig-raster-pane'

function isRasterDebugEnabled(): boolean {
  if (typeof window === 'undefined') return true

  const queryFlag = new URLSearchParams(window.location.search).get('rasterDebug')
  if (queryFlag === '1' || queryFlag === 'true') return true
  if (queryFlag === '0' || queryFlag === 'false') return false

  const storageFlag = window.localStorage.getItem('sig:raster-debug')
  if (storageFlag === null) return true
  return storageFlag === '1' || storageFlag === 'true'
}

async function loadGeoRaster(url: string, signal: AbortSignal): Promise<any> {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`Falha HTTP ${response.status} ao carregar raster.`)
  }
  const buffer = await response.arrayBuffer()
  return parseGeoraster(buffer)
}

export default function GeoRasterOverlay({
  rasterKey,
  url,
  visible = true,
  opacity = 0.7,
  resolution = 256,
  zIndex = 440,
  colorizer,
  onStatusChange
}: GeoRasterOverlayProps) {
  const map = useMap()
  const debugEnabledRef = useRef<boolean>(isRasterDebugEnabled())
  const layerCacheRef = useRef<Map<string, SigRasterLayer>>(new Map())
  const activeRasterKeyRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const colorizerRef = useRef(colorizer)
  const onStatusChangeRef = useRef(onStatusChange)
  const opacityRef = useRef(opacity)
  const lastStatusRef = useRef<string>('')

  useEffect(() => {
    colorizerRef.current = colorizer
  }, [colorizer])

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  function debugLog(message: string, payload?: Record<string, unknown>) {
    if (!debugEnabledRef.current) return
    if (payload) {
      try {
        console.debug(`[SIG Raster Debug] ${message} ${JSON.stringify(payload)}`)
      } catch {
        console.debug(`[SIG Raster Debug] ${message}`, payload)
      }
      return
    }
    console.debug(`[SIG Raster Debug] ${message}`)
  }

  function debugSnapshot(label: string) {
    if (!debugEnabledRef.current) return

    const mapAsAny = map as unknown as { _layers?: Record<string, unknown> }
    let mapEachLayerCount = 0
    let georasterLayerCount = 0
    let rasterPaneLayerCount = 0

    map.eachLayer((layer) => {
      mapEachLayerCount += 1
      const candidate = layer as SigRasterLayer & { georasters?: unknown[]; options?: { pane?: string } }
      if (Array.isArray(candidate.georasters)) georasterLayerCount += 1
      if (candidate.options?.pane === RASTER_PANE) rasterPaneLayerCount += 1
    })

    const pane = map.getPane(RASTER_PANE)
    const paneChildren = pane?.children.length ?? 0
    const tileCanvasCount = map.getContainer().querySelectorAll('canvas.leaflet-tile').length
    const rawLayerRegistryCount = Object.keys(mapAsAny._layers ?? {}).length

    debugLog(label, {
      rasterKey,
      url,
      visible,
      cacheKeys: [...layerCacheRef.current.keys()],
      activeRasterKey: activeRasterKeyRef.current,
      requestId: requestIdRef.current,
      mapEachLayerCount,
      georasterLayerCount,
      rasterPaneLayerCount,
      rawLayerRegistryCount,
      paneChildren,
      tileCanvasCount
    })
  }

  function emitStatus(status: { state: 'loading' | 'ready' | 'error'; message?: string }) {
    const signature = `${status.state}:${status.message ?? ''}`
    if (lastStatusRef.current === signature) return
    lastStatusRef.current = signature
    debugLog('status:emit', { state: status.state, message: status.message })
    onStatusChangeRef.current?.(status)
  }

  function ensurePane() {
    if (!map.getPane(RASTER_PANE)) {
      map.createPane(RASTER_PANE)
      debugLog('pane:create', { pane: RASTER_PANE })
    }
    const pane = map.getPane(RASTER_PANE)
    if (pane) pane.style.zIndex = String(zIndex)
    debugLog('pane:ready', { pane: RASTER_PANE, zIndex })
  }

  function removeAllRasterLayers(exceptKey?: string) {
    const removedKeys: string[] = []
    const removedOrphanLeafletIds: Array<string | number> = []
    const exceptLayer = exceptKey ? layerCacheRef.current.get(exceptKey) : undefined

    layerCacheRef.current.forEach((layer, key) => {
      if (exceptKey && key === exceptKey) return
      if (map.hasLayer(layer)) {
        map.removeLayer(layer)
        removedKeys.push(key)
      }
    })

    map.eachLayer((layer) => {
      const candidate = layer as SigRasterLayer & {
        georasters?: unknown[]
        options?: { pane?: string }
        _leaflet_id?: string | number
      }

      const isRasterCandidate = Array.isArray(candidate.georasters) || candidate.options?.pane === RASTER_PANE
      if (!isRasterCandidate) return
      if (exceptLayer && layer === exceptLayer) return
      if (!map.hasLayer(layer)) return

      map.removeLayer(layer)
      removedOrphanLeafletIds.push(candidate._leaflet_id ?? 'unknown')
    })

    debugLog('layers:removeAll', { exceptKey, removedKeys, removedOrphanLeafletIds })
    debugSnapshot('snapshot:after-removeAll')
  }

  function clearRasterPaneCanvasTiles() {
    const pane = map.getPane(RASTER_PANE)
    if (!pane) return
    const tileCanvases = pane.querySelectorAll('canvas.leaflet-tile')
    tileCanvases.forEach((canvas) => canvas.remove())
    debugLog('pane:clearCanvasTiles', { removed: tileCanvases.length })
  }

  function removeCachedLayerByKey(key: string) {
    const layer = layerCacheRef.current.get(key)
    if (!layer) return
    if (map.hasLayer(layer)) {
      map.removeLayer(layer)
    }
    layerCacheRef.current.delete(key)
    debugLog('cache:delete', { key })
  }

  function applyVisuals(layer: SigRasterLayer) {
    if (typeof layer.setOpacity === 'function') {
      layer.setOpacity(opacityRef.current)
    }
    if (typeof layer.setZIndex === 'function') {
      layer.setZIndex(zIndex)
    }
    debugLog('layer:applyVisuals', { zIndex, opacity: opacityRef.current })
  }

  function clearInternalLayerCache(layer: SigRasterLayer, key: string, reason: string) {
    if (typeof layer.clearCache === 'function') {
      layer.clearCache()
    }
    layer._cache = { innerTile: {}, tile: {} }
    if (typeof layer._removeAllTiles === 'function') {
      layer._removeAllTiles()
    }
    debugLog('layer:clearInternalCache', { key, reason })
  }

  function activateSingleLayer(key: string, layer: SigRasterLayer) {
    debugLog('layer:activate:start', { key })
    removeAllRasterLayers(key)
    clearRasterPaneCanvasTiles()
    clearInternalLayerCache(layer, key, 'activate')
    applyVisuals(layer)
    if (!map.hasLayer(layer)) {
      map.addLayer(layer)
      debugLog('layer:addedToMap', { key })
    }
    if (typeof layer.redraw === 'function') {
      layer.redraw()
      debugLog('layer:redraw', { key })
    }
    activeRasterKeyRef.current = key
    debugSnapshot('snapshot:after-activateSingleLayer')
  }

  useEffect(() => {
    opacityRef.current = opacity
    debugLog('opacity:update', { opacity })
    const activeKey = activeRasterKeyRef.current
    if (!activeKey) return
    const activeLayer = layerCacheRef.current.get(activeKey)
    if (!activeLayer) return
    if (typeof activeLayer.setOpacity === 'function') {
      activeLayer.setOpacity(opacity)
    }
  }, [opacity])

  useEffect(() => {
    const onMapSettled = () => {
      const activeKey = activeRasterKeyRef.current
      if (!activeKey) return
      const activeLayer = layerCacheRef.current.get(activeKey)
      if (!activeLayer) return

      clearInternalLayerCache(activeLayer, activeKey, 'map-settled')
      if (typeof activeLayer.redraw === 'function') {
        activeLayer.redraw()
      }
      debugSnapshot('snapshot:after-map-settled-redraw')
    }

    map.on('zoomend', onMapSettled)
    map.on('moveend', onMapSettled)

    return () => {
      map.off('zoomend', onMapSettled)
      map.off('moveend', onMapSettled)
    }
  }, [map])

  useEffect(() => {
    if (!debugEnabledRef.current) return

    const onLayerAdd = (event: { layer: Layer }) => {
      const candidate = event.layer as SigRasterLayer & { georasters?: unknown[]; options?: { pane?: string }; _leaflet_id?: number | string }
      const isRaster = Array.isArray(candidate.georasters) || candidate.options?.pane === RASTER_PANE
      if (!isRaster) return
      debugLog('event:layeradd', {
        leafletId: candidate._leaflet_id,
        pane: candidate.options?.pane,
        hasGeorasters: Array.isArray(candidate.georasters)
      })
    }

    const onLayerRemove = (event: { layer: Layer }) => {
      const candidate = event.layer as SigRasterLayer & { georasters?: unknown[]; options?: { pane?: string }; _leaflet_id?: number | string }
      const isRaster = Array.isArray(candidate.georasters) || candidate.options?.pane === RASTER_PANE
      if (!isRaster) return
      debugLog('event:layerremove', {
        leafletId: candidate._leaflet_id,
        pane: candidate.options?.pane,
        hasGeorasters: Array.isArray(candidate.georasters)
      })
    }

    map.on('layeradd', onLayerAdd)
    map.on('layerremove', onLayerRemove)

    return () => {
      map.off('layeradd', onLayerAdd)
      map.off('layerremove', onLayerRemove)
    }
  }, [map])

  useEffect(() => {
    debugLog('effect:main:start', { rasterKey, url, visible, resolution, zIndex })
    debugSnapshot('snapshot:effect-main-start')
    ensurePane()

    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    removeAllRasterLayers()
    clearRasterPaneCanvasTiles()
    activeRasterKeyRef.current = null

    if (!visible) {
      emitStatus({ state: 'ready' })
      debugLog('effect:main:end-not-visible')
      return
    }

    const cachedLayer = layerCacheRef.current.get(rasterKey)
    if (cachedLayer) {
      debugLog('cache:hit', { rasterKey })
      activateSingleLayer(rasterKey, cachedLayer)
      emitStatus({ state: 'ready' })
      debugLog('effect:main:end-cache-hit')
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    debugLog('request:start', { requestId, rasterKey, url })
    emitStatus({ state: 'loading' })

    async function loadAndCacheLayer() {
      try {
        const georaster = await loadGeoRaster(url, controller.signal)
        if (controller.signal.aborted) {
          debugLog('request:aborted-after-fetch', { requestId, rasterKey })
          return
        }
        if (requestIdRef.current !== requestId) {
          debugLog('request:stale-ignored', { requestId, currentRequestId: requestIdRef.current, rasterKey })
          return
        }

        debugLog('request:loaded', { requestId, rasterKey })

        const mins = Array.isArray(georaster?.mins) ? georaster.mins : []
        const maxs = Array.isArray(georaster?.maxs) ? georaster.maxs : []
        const noDataValue = georaster?.noDataValue
        const min = Number.isFinite(Number(mins[0])) ? Number(mins[0]) : 0
        const max = Number.isFinite(Number(maxs[0])) ? Number(maxs[0]) : min + 1

        const layer = new GeoRasterLayer({
          georaster,
          pane: RASTER_PANE,
          resolution,
          opacity: opacityRef.current,
          caching: false,
          keepBuffer: 0,
          updateWhenIdle: true,
          updateWhenZooming: true,
          pixelValuesToColorFn: (values: number[] | number) => {
            const raw = Array.isArray(values) ? values[0] : values
            if (!Number.isFinite(raw)) return null
            const value = Number(raw)
            if (!Number.isFinite(value)) return null
            if (noDataValue !== null && noDataValue !== undefined && value === Number(noDataValue)) return null
            if (!colorizerRef.current) return null
            return colorizerRef.current(value, { min, max })
          }
        }) as SigRasterLayer

        layerCacheRef.current.set(rasterKey, layer)
        debugLog('cache:set', { rasterKey, cacheKeys: [...layerCacheRef.current.keys()] })
        activateSingleLayer(rasterKey, layer)
        emitStatus({ state: 'ready' })
      } catch (error) {
        if (controller.signal.aborted) return
        removeCachedLayerByKey(rasterKey)
        const message = error instanceof Error ? error.message : 'Falha desconhecida no carregamento da camada raster.'
        console.error('[SIG Raster] Erro ao carregar camada:', error)
        emitStatus({ state: 'error', message })
      }
    }

    void loadAndCacheLayer()

    return () => {
      debugLog('effect:main:cleanup:start', { rasterKey, requestId })
      controller.abort()
      abortControllerRef.current = null
      removeAllRasterLayers()
      clearRasterPaneCanvasTiles()
      activeRasterKeyRef.current = null
      debugSnapshot('snapshot:effect-main-cleanup-end')
    }
  }, [map, rasterKey, resolution, url, visible, zIndex])

  useEffect(() => {
    return () => {
      debugLog('effect:unmount:cleanup:start')
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      removeAllRasterLayers()
      clearRasterPaneCanvasTiles()
      activeRasterKeyRef.current = null
      debugSnapshot('snapshot:unmount-cleanup-end')
    }
  }, [])

  return null
}
