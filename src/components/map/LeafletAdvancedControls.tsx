import { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import 'leaflet-draw'
import 'leaflet-control-geocoder'
import 'leaflet.locatecontrol'

function formatDistance(distanceInMeters: number): string {
  if (distanceInMeters >= 1000) return `${(distanceInMeters / 1000).toFixed(2)} km`
  return `${distanceInMeters.toFixed(1)} m`
}

function formatArea(areaInSquareMeters: number): string {
  if (areaInSquareMeters >= 1_000_000) return `${(areaInSquareMeters / 1_000_000).toFixed(2)} km²`
  if (areaInSquareMeters >= 10_000) return `${(areaInSquareMeters / 10_000).toFixed(2)} ha`
  return `${areaInSquareMeters.toFixed(2)} m²`
}

function extractLine(latlngs: unknown): L.LatLng[] {
  if (!Array.isArray(latlngs)) return []
  if (latlngs.length === 0) return []

  const first = latlngs[0]
  if (Array.isArray(first)) {
    return first as L.LatLng[]
  }

  return latlngs as L.LatLng[]
}

function extractRing(latlngs: unknown): L.LatLng[] {
  if (!Array.isArray(latlngs)) return []
  if (latlngs.length === 0) return []

  const first = latlngs[0]
  if (!Array.isArray(first)) return latlngs as L.LatLng[]

  const second = first[0]
  if (Array.isArray(second)) {
    return first[0] as L.LatLng[]
  }

  return first as L.LatLng[]
}

function computeDistance(map: L.Map, points: L.LatLng[]): number {
  let distance = 0
  for (let index = 1; index < points.length; index += 1) {
    distance += map.distance(points[index - 1], points[index])
  }
  return distance
}

function computePerimeter(map: L.Map, ring: L.LatLng[]): number {
  if (ring.length < 3) return 0

  const prepared = ring[0].equals(ring[ring.length - 1]) ? ring.slice(0, -1) : ring
  let perimeter = 0

  for (let index = 0; index < prepared.length; index += 1) {
    const current = prepared[index]
    const next = prepared[(index + 1) % prepared.length]
    perimeter += map.distance(current, next)
  }

  return perimeter
}

function bindMeasurements(layer: L.Layer, map: L.Map) {
  if (layer instanceof L.Marker) {
    const point = layer.getLatLng()
    layer.bindPopup([
      '<div class="map-popup">',
      '<strong>Ponto</strong>',
      `<div>Latitude: ${point.lat.toFixed(6)}</div>`,
      `<div>Longitude: ${point.lng.toFixed(6)}</div>`,
      '</div>'
    ].join(''))
    return
  }

  if (layer instanceof L.Polygon) {
    const ring = extractRing(layer.getLatLngs())
    const geometryUtil = (L as unknown as { GeometryUtil?: { geodesicArea?: (coords: L.LatLng[]) => number } }).GeometryUtil

    const area = geometryUtil?.geodesicArea ? geometryUtil.geodesicArea(ring) : 0
    const perimeter = computePerimeter(map, ring)

    layer.bindPopup([
      '<div class="map-popup">',
      '<strong>Polígono</strong>',
      `<div>Área: ${formatArea(area)}</div>`,
      `<div>Perímetro: ${formatDistance(perimeter)}</div>`,
      '</div>'
    ].join(''))
    return
  }

  if (layer instanceof L.Polyline) {
    const line = extractLine(layer.getLatLngs())
    const distance = computeDistance(map, line)

    layer.bindPopup([
      '<div class="map-popup">',
      '<strong>Linha</strong>',
      `<div>Distância: ${formatDistance(distance)}</div>`,
      '</div>'
    ].join(''))
  }
}

export default function LeafletAdvancedControls() {
  const map = useMap()

  useEffect(() => {
    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polyline: {
          metric: true,
          showLength: true,
          shapeOptions: { color: '#0d667f', weight: 3 }
        },
        polygon: {
          allowIntersection: false,
          showArea: true,
          metric: true,
          shapeOptions: { color: '#0d667f', weight: 2.5 }
        },
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: {}
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    })

    map.addControl(drawControl)

    const onCreated: L.LeafletEventHandlerFn = (event) => {
      const createdEvent = event as L.DrawEvents.Created
      bindMeasurements(createdEvent.layer, map)
      drawnItems.addLayer(createdEvent.layer)

      if ('openPopup' in createdEvent.layer && typeof createdEvent.layer.openPopup === 'function') {
        createdEvent.layer.openPopup()
      }
    }

    const onEdited: L.LeafletEventHandlerFn = (event) => {
      const editedEvent = event as L.DrawEvents.Edited
      editedEvent.layers.eachLayer((layer) => {
        bindMeasurements(layer, map)
      })
    }

    map.on(L.Draw.Event.CREATED, onCreated)
    map.on(L.Draw.Event.EDITED, onEdited)

    const geocoderFactory = (L.Control as unknown as { geocoder?: (options?: Record<string, unknown>) => L.Control }).geocoder
    const geocoderControl = geocoderFactory
      ? geocoderFactory({
          defaultMarkGeocode: true,
          placeholder: 'Buscar localidade',
          position: 'topright'
        })
      : null

    if (geocoderControl) map.addControl(geocoderControl)

    const locateFactory = (L.control as unknown as { locate?: (options?: Record<string, unknown>) => L.Control }).locate
    const locateControl = locateFactory
      ? locateFactory({
          position: 'topright',
          drawCircle: true,
          keepCurrentZoomLevel: true,
          flyTo: true,
          showPopup: true,
          strings: { title: 'Minha localização' }
        })
      : null

    if (locateControl) locateControl.addTo(map)

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated)
      map.off(L.Draw.Event.EDITED, onEdited)
      map.removeControl(drawControl)
      if (geocoderControl) map.removeControl(geocoderControl)
      if (locateControl) map.removeControl(locateControl)
      map.removeLayer(drawnItems)
    }
  }, [map])

  return null
}
