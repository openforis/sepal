import {Layer} from './layer'

export class TileLayer extends Layer {
    createTileProvider = () => {
        throw new Error('TileLayer.createTileProvider needs to be implemented by subclass')
    }

    createOverlay = _tileProvider => {
        throw new Error('TileLayer.createOverlay needs to be implemented by subclass')
    }

    addToMap = urlTemplate => {
        this.tileProvider = this.createTileProvider(urlTemplate)
        this.overlay = this.createOverlay(this.tileProvider)
        const {map, layerIndex, overlay} = this
        const {googleMap} = map.getGoogle()
        googleMap.overlayMapTypes.setAt(layerIndex, overlay)
    }

    removeFromMap = () => {
        const {map, layerIndex, overlay} = this
        const {googleMap} = map.getGoogle()
        if (overlay) {
            // googleMap.overlayMapTypes.removeAt(layerIndex)
            // [HACK] Prevent flashing of removed layers, which happens when just setting overlay to null.
            // [HACK] Prevent removal of already removed tileManager.
            googleMap.overlayMapTypes.insertAt(layerIndex, null)
            googleMap.overlayMapTypes.removeAt(layerIndex + 1)
            overlay.close()
        }
    }

    setVisibility = visible => {
        const {tileProvider} = this
        if (tileProvider) {
            tileProvider.setVisibility(visible)
        }
    }
}
