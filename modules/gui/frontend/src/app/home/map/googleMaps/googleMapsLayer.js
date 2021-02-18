import {CancellingTileProvider} from '../tileProvider/cancellingTileProvider'
import {MonitoringTileProvider} from '../tileProvider/monitoringTileProvider'
import {PrioritizingTileProvider} from '../tileProvider/prioritizingTileProvider'
import {RetryingTileManager} from '../tileProvider/retryingTileManager'

export const TileLayer = ({
    layerIndex,
    tileProvider,
    mapContext,
    minZoom = 0,
    maxZoom = 20,
    progress$
}) => {
    const mapLayer = new GoogleMapsLayer(tileProvider, {mapContext, minZoom, maxZoom}, progress$)
    return {
        add() {
            mapContext.googleMap.overlayMapTypes.setAt(layerIndex, mapLayer)
        },

        remove() {
            // TODO: Only do this if added to the map
            // TODO: Unregister listeners
            // [HACK] Prevent flashing of removed layers, which happens when just setting layer to null
            mapContext.googleMap.overlayMapTypes.insertAt(layerIndex, null)
            mapContext.googleMap.overlayMapTypes.removeAt(layerIndex + 1)
        },

        hide(hidden) {
            mapLayer.setOpacity(hidden ? 0 : 1)
        },

        progress$() {
            // TODO: Implement...
            // {count, loading, failed, loaded, completed}
        }
    }
}

class GoogleMapsLayer {
    constructor(tileProvider, {
        mapContext,
        name,
        minZoom = 0,
        maxZoom = 20,
    } = {}, progress$) {
        this.tileProvider =
            new MonitoringTileProvider(
                new RetryingTileManager(3,
                    new PrioritizingTileProvider(
                        new CancellingTileProvider(
                            tileProvider
                        )
                    )
                ), progress$
            )
        this.name = name
        this.minZoom = minZoom
        this.maxZoom = maxZoom
        this.tileSize = new mapContext.google.maps.Size(
            tileProvider.tileSize || 256,
            tileProvider.tileSize || 256
        )
        this.alt = undefined
        this.projection = undefined
        this.radius = undefined
        this.tileElementById = {}
        this.opacity = 1
    }

    getTile({x, y}, zoom, doc) {
        const tileRequest = this._toTileRequest({x, y, zoom, minZoom: this.minZoom, doc})
        const tileElement = tileRequest.element
        this.tileElementById[tileElement.id] = tileElement
        if (tileRequest.outOfBounds)
            return tileElement

        const tile$ = this.tileProvider.loadTile$(tileRequest)
        // TODO: Error handling
        tile$.subscribe(blob => renderImageBlob(tileElement, blob))
        return tileElement
    }

    releaseTile(tileElement) {
        delete this.tileElementById[tileElement.id]
        this.tileProvider.releaseTile(tileElement.id)
    }

    setOpacity(opacity) {
        if (this.opacity !== opacity) {
            Object.values(this.tileElementById)
                .forEach(tileElement => tileElement.style.opacity = opacity)
            this.tileProvider.hide(!opacity)
            this.opacity = opacity
        }
    }

    close() {
        this.tileProvider.close()
    }

    _toTileRequest({x, y, zoom, minZoom, doc}) {
        const maxCoord = 1 << zoom
        x = x % maxCoord
        if (x < 0) {
            x += maxCoord
        }
        const element = doc.createElement('div')
        const id = [this.tileProvider.id, zoom, x, y].join('/')
        element.id = id
        const outOfBounds = zoom < minZoom || y < 0 || y >= maxCoord
        return {id, x, y, zoom, element, outOfBounds}
    }

}

const renderImageBlob = (element, blob) =>
    element.innerHTML = `<img src="${(window.URL || window.webkitURL).createObjectURL(blob)}"/>`
