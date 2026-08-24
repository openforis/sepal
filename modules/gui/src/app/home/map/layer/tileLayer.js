import {OverlayMapTypeLayer} from './overlayMapTypeLayer'

export class TileLayer extends OverlayMapTypeLayer {
    createTileProvider = () => {
        throw new Error('TileLayer.createTileProvider needs to be implemented by subclass')
    }

    createOverlay = _tileProvider => {
        throw new Error('TileLayer.createOverlay needs to be implemented by subclass')
    }

    addToMap = urlTemplate => {
        this.tileProvider = this.createTileProvider(urlTemplate)
        this.mountOverlay(this.createOverlay(this.tileProvider))
    }

    closeOverlay = overlay => overlay.close()

    setVisibility = visible => {
        const {tileProvider} = this
        if (tileProvider) {
            tileProvider.setVisibility(visible)
        }
    }
}
