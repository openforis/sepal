import {GoogleMapsOverlay} from './googleMapsOverlay'
import OverlayLayer from './overlayLayer'

export default class TileLayer extends OverlayLayer {
    constructor({map, layerIndex, progress$, minZoom, maxZoom}) {
        super({map, layerIndex, progress$})
        this.minZoom = minZoom
        this.maxZoom = maxZoom
    }

    equals(_o) {
        throw new Error('Subclass should implement equals')
    }

    createTileProvider() {
        throw new Error('Subclass should implement createTileProvider')
    }

    createOverlay() {
        const {map, progress$, minZoom, maxZoom} = this
        const tileProvider = this.createTileProvider()
        const {google} = map.getGoogle()
        return new GoogleMapsOverlay(tileProvider, {google, minZoom, maxZoom}, progress$)
    }

    removeFromMap() {
        super.removeFromMap()
        const {overlay} = this
        if (overlay) {
            overlay.close()
        }
    }

    hide(hidden) {
        const {overlay} = this
        if (overlay) {
            overlay.setOpacity(hidden ? 0 : 1)
        }
    }
}
