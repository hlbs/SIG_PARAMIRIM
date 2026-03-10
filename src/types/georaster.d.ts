declare module 'georaster' {
  export default function parseGeoraster(data: ArrayBuffer): Promise<any>
}

declare module 'georaster-layer-for-leaflet' {
  import type { Layer } from 'leaflet'

  export default class GeoRasterLayer extends Layer {
    constructor(options: Record<string, unknown>)
    setOpacity?(opacity: number): this
    setZIndex?(zIndex: number): this
  }
}
