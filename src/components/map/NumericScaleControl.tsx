import { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'

function roundedScaleDenominator(value: number): number {
  if (value <= 0) return 1
  if (value < 10_000) return Math.round(value / 100) * 100
  if (value < 100_000) return Math.round(value / 1_000) * 1_000
  if (value < 1_000_000) return Math.round(value / 5_000) * 5_000
  return Math.round(value / 10_000) * 10_000
}

export default function NumericScaleControl() {
  const map = useMap()

  useEffect(() => {
    let container: HTMLDivElement | null = null

    const numericScaleControl = new L.Control({ position: 'bottomleft' })

    numericScaleControl.onAdd = () => {
      container = L.DomUtil.create('div', 'leaflet-control numeric-scale-control')
      L.DomEvent.disableClickPropagation(container)
      return container
    }

    numericScaleControl.addTo(map)

    // Keep numeric scale directly below the graphic km scale.
    const positionNumericBelowScale = () => {
      if (!container) return
      const root = map.getContainer()
      const bottomLeft = root.querySelector('.leaflet-bottom.leaflet-left')
      const metricScale = root.querySelector('.leaflet-control-scale')
      if (bottomLeft && metricScale && metricScale.parentElement === bottomLeft) {
        bottomLeft.insertBefore(container, metricScale.nextSibling)
      }
    }

    const updateScale = () => {
      if (!container) return

      const zoom = map.getZoom()
      const latitude = map.getCenter().lat
      const metersPerPixel = 156543.03392 * Math.cos((latitude * Math.PI) / 180) / (2 ** zoom)
      const denominator = metersPerPixel / 0.000264583
      const rounded = roundedScaleDenominator(denominator)

      container.textContent = `Escala 1:${rounded.toLocaleString('pt-BR')}`
    }

    positionNumericBelowScale()
    map.on('zoomend moveend', updateScale)
    updateScale()

    return () => {
      map.off('zoomend moveend', updateScale)
      numericScaleControl.remove()
    }
  }, [map])

  return null
}
