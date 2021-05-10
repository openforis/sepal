import {CancellingTileProvider} from '../tileProvider/cancellingTileProvider'
import {MonitoringTileProvider} from '../tileProvider/monitoringTileProvider'
import {PrioritizingTileProvider} from '../tileProvider/prioritizingTileProvider'
import {RetryingTileManager} from '../tileProvider/retryingTileManager'
import guid from 'guid'

export const TileLayer = ({
    layerIndex,
    tileProvider,
    map,
    minZoom = 0,
    maxZoom = 20,
    progress$
}) => {
    const {google} = map.getGoogle()
    const mapLayer = new GoogleMapsLayer(tileProvider, {google, minZoom, maxZoom}, progress$)
    return {
        add() {
            map.addToMap(layerIndex, mapLayer)
        },

        remove() {
            map.removeFromMap(layerIndex)
        },

        hide(hidden) {
            mapLayer.setOpacity(hidden ? 0 : 1)
        }
    }
}

class GoogleMapsLayer {
    constructor(tileProvider, {
        google,
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
        this.tileSize = new google.maps.Size(
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
        const request = this._toTileRequest({x, y, zoom, minZoom: this.minZoom, doc})
        const element = request.element
        this.tileElementById[element.id] = element
        if (request.outOfBounds)
            return element

        const tile$ = this.tileProvider.loadTile$(request)
        tile$.subscribe(blob => this.tileProvider.renderTile({doc, element, blob}))
        return element
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
        const element = this.tileProvider.createElement(doc)
        element.style.opacity = this.opacity
        const id = [this.tileProvider.id, zoom, x, y, guid()].join('/')
        element.id = id
        const outOfBounds = zoom < minZoom || y < 0 || y >= maxCoord
        return {id, x, y, zoom, element, outOfBounds}
    }

}
